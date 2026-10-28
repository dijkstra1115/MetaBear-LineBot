// Binance collector (one per market): the same storage, queries and detectors as the Bybit Collector, fed by
// the Tokyo relay (relay/binance-relay.mjs) instead of its own sockets, because Binance refuses
// Cloudflare (docs/ORDERFLOW-CF-PROBE.md, docs/ORDERFLOW-BINANCE-RELAY.md). The relay connects in
// over a WebSocket, forwards Binance's combined-stream messages untouched (a second's worth per
// frame) and answers REST requests for whitelisted public paths, so every Binance call goes through it.
// The socket is a hibernatable one and nothing here sets a timer, so the object is only billed while
// it handles a frame or an alarm, not for the idle time in between (docs/ORDERFLOW-RELAY-HIBERNATION.md).
import { BinanceBook, binanceArchiveUrl, parseAggTrade, parseArchiveLine, parseKlines } from "../../public/lab/orderflow/binance.js";
import { BACKFILL_DAYS, Collector, DAY, FIVE_MIN, HEALTH_DOWN_MS, MINUTE, SILENT_MS, type OrderflowEnv, type Trade } from "./collector";

const REST_TIMEOUT_MS = 15_000;
// Missed aggregate trades are fetched by id, 1,000 a page (a few minutes of BTC each). Longer
// outages are left to the hourly klines and recorded as a gap.
const GAP_PAGES = 30;
const SYNC_DELAY_MS = 500; // diffs are buffered until the snapshot lands; give the stream a moment to start
const SYNC_RETRY_MS = 2_000;
const SYNC_TRIES = 3;

type AggTrade = Trade & { a: number };
// No timers: a call past its deadline is rejected by the next frame or alarm that looks.
type Pending = { resolve: (v: unknown) => void; reject: (e: Error) => void; deadline: number; path: string };

export class BinanceCollector extends Collector {
  protected override book = new BinanceBook();
  protected override source = "binance";
  // Binance's daily aggTrades zip is downloadable from Cloudflare (only the live API refuses it).
  protected override archiveName = "Binance";
  protected override archiveLateMs = 12 * 3_600_000;
  protected override archiveSource(day: string) {
    return { url: binanceArchiveUrl(day, this.m.symbol), zip: true };
  }
  protected override archiveTrade(line: string) {
    return parseArchiveLine(line);
  }
  private relay: { ws: WebSocket; last: number; info: Record<string, unknown> } | null = null;
  private relayState = "idle";
  private calls = new Map<number, Pending>();
  private nextCall = 1;
  private aggId = 0; // the newest aggregate trade id taken in
  private gaps: [number, number][] = [];
  private filling = false;
  private syncing = false;
  private syncAt = 0; // the book is synced by the first frame at or after this time
  private syncTries = 0;
  // aggTrades of one taker order share a time and side; they are held until the next one so its
  // print is summed (Bybit sends a match's fills in one message).
  private run: AggTrade[] = [];

  constructor(ctx: DurableObjectState, env: OrderflowEnv) {
    super(ctx, env);
    this.aggId = Number(this.meta("aggId") ?? 0);
    // Back from eviction with the relay still connected: take its socket again and rebuild the book.
    const [ws] = ctx.getWebSockets("relay");
    if (ws) {
      this.relay = { ws, last: Date.now(), info: {} };
      this.relayState = "open";
      this.syncAt = Date.now();
    }
  }

  // ---------- relay connection ----------

  private acceptRelay(request: Request) {
    if (request.headers.get("upgrade")?.toLowerCase() !== "websocket") return new Response("expected a websocket", { status: 426 });
    const [client, server] = Object.values(new WebSocketPair());
    this.dropRelay("replaced");
    for (const old of this.ctx.getWebSockets("relay")) old.close(1000, "replaced");
    this.ctx.acceptWebSocket(server, ["relay"]);
    this.relay = { ws: server, last: Date.now(), info: {} };
    this.relayState = "open";
    this.book.reset();
    this.syncAt = Date.now() + SYNC_DELAY_MS;
    this.syncTries = 0;
    // The relay sends frames only to a collector that asks for them: a deploy does not restart a
    // running object, so one still on older code keeps getting single messages until it restarts.
    server.send(JSON.stringify({ hello: { frames: 1 } }));
    return new Response(null, { status: 101, webSocket: client });
  }

  // A frame is {"b":[…]}, a second of Binance messages in order; REST replies and the relay's
  // heartbeat come on their own.
  override async webSocketMessage(ws: WebSocket, data: string | ArrayBuffer) {
    if (ws !== this.relay?.ws) return;
    const now = Date.now();
    this.relay.last = now;
    this.expireCalls(now);
    let m: any;
    try {
      m = JSON.parse(typeof data === "string" ? data : new TextDecoder().decode(data));
    } catch (err) {
      return this.note("errors", `relay message: ${err}`);
    }
    for (const one of Array.isArray(m.b) ? m.b : [m]) {
      try {
        this.onRelay(one);
      } catch (err) {
        this.note("errors", `relay message: ${err}`);
      }
    }
    if (!this.book.ready && now >= this.syncAt) void this.syncBook();
  }

  override async webSocketClose(ws: WebSocket, code: number) {
    if (ws === this.relay?.ws) this.dropRelay(`closed ${code}`);
  }

  override async webSocketError(ws: WebSocket) {
    if (ws === this.relay?.ws) this.dropRelay("error");
  }

  private expireCalls(now: number) {
    for (const [id, call] of this.calls)
      if (now > call.deadline) {
        this.calls.delete(id);
        call.reject(new Error(`${call.path} timed out`));
      }
  }

  private dropRelay(why: string) {
    const relay = this.relay;
    if (!relay) return;
    this.relay = null;
    this.relayState = why;
    try {
      relay.ws.close(1000, why.slice(0, 100));
    } catch {}
    for (const [id, call] of this.calls) {
      call.reject(new Error(`relay ${why}`));
      this.calls.delete(id);
    }
  }

  private onRelay(m: any) {
    if (typeof m.id === "number") {
      const call = this.calls.get(m.id);
      if (!call) return;
      this.calls.delete(m.id);
      if (m.status === 200) call.resolve(JSON.parse(m.body));
      else call.reject(new Error(`HTTP ${m.status} ${String(m.body ?? "").slice(0, 120)}`));
      return;
    }
    if (m.relay) {
      if (this.relay) this.relay.info = m.relay;
      return;
    }
    const stream = String(m.stream ?? "");
    if (stream.endsWith("@aggTrade")) this.onAgg(parseAggTrade(m.data));
    else if (stream.includes("@depth")) this.onDepth(m.data);
    else if (stream.includes("@markPrice")) (this.ticker.funding = Number(m.data.r)), ((this.ticker as { mark?: number }).mark = Number(m.data.p));
    else if (stream.endsWith("@forceOrder")) this.saveLiqs(this.liqFeed("binance").parse(m));
  }

  /** GET a whitelisted Binance REST path through the relay. */
  private rest<T = any>(path: string): Promise<T> {
    const relay = this.relay;
    if (!relay) return Promise.reject(new Error("relay not connected"));
    const id = this.nextCall++;
    return new Promise<T>((resolve, reject) => {
      this.calls.set(id, { resolve: resolve as (v: unknown) => void, reject, deadline: Date.now() + REST_TIMEOUT_MS, path: path.split("?")[0] });
      relay.ws.send(JSON.stringify({ id, get: path }));
    });
  }

  // ---------- trades ----------

  private onAgg(tr: AggTrade) {
    if (this.aggId && tr.a > this.aggId + 1) this.gaps.push([this.aggId + 1, tr.a - 1]);
    if (tr.a > this.aggId) this.aggId = tr.a;
    if (this.run.length && (this.run[0].t !== tr.t || this.run[0].sell !== tr.sell)) this.flushRun();
    this.run.push(tr);
    if (this.gaps.length) void this.fillGaps();
  }

  private flushRun() {
    if (!this.run.length) return;
    this.addTrades(this.run);
    this.run = [];
  }

  // Aggregate trade ids are consecutive, so whatever the relay dropped (a reconnect, a restart of
  // this object) is fetched exactly by id.
  private async fillGaps() {
    if (this.filling) return;
    this.filling = true;
    try {
      while (this.gaps.length) {
        const [from, to] = this.gaps[0];
        let next = from;
        for (let page = 0; next <= to && page < GAP_PAGES; page++) {
          const list = ((await this.rest<any[]>(`/fapi/v1/aggTrades?symbol=${this.m.symbol}&fromId=${next}&limit=1000`)) ?? []).map(parseAggTrade).filter((tr) => tr.a <= to);
          if (!list.length) break;
          this.addTrades(list);
          next = list[list.length - 1].a + 1;
        }
        if (next <= to) this.note("gaps", `binance trades ${from}–${to}: ${to - next + 1} not recovered`);
        this.gaps.shift();
      }
    } catch (err) {
      this.note("errors", `binance trade backfill: ${err}`);
      this.gaps = []; // a later trade opens a new gap; the klines cover the rest
    } finally {
      this.filling = false;
    }
  }

  // ---------- order book ----------

  private onDepth(e: any) {
    const changes = this.book.diff(e);
    if (changes === "resync") {
      this.note("gaps", "binance depth chain broken, resyncing");
      this.syncAt = 0;
      this.syncTries = 0;
      return;
    }
    if (!changes?.length) return;
    const top = this.book.best();
    if (!top) return;
    for (const ev of this.spoofWatch.update(Number(e.E) || Date.now(), changes, top)) {
      this.alert(ev);
      this.wallWatch.forget(ev.side as string, ev.price as number);
    }
  }

  // One snapshot per call; one that does not join the buffered diffs is retried by a frame
  // SYNC_RETRY_MS later, and after SYNC_TRIES misses by the next alarm.
  private async syncBook() {
    if (this.syncing || !this.relay) return;
    this.syncing = true;
    try {
      const snap = await this.rest(`/fapi/v1/depth?symbol=${this.m.symbol}&limit=1000`);
      if (this.book.load(snap) === "snapshot") {
        this.spoofWatch.reset(Date.now(), this.book.bids, this.book.asks);
        this.syncTries = 0;
        return;
      }
      if (++this.syncTries < SYNC_TRIES) this.syncAt = Date.now() + SYNC_RETRY_MS;
      else {
        this.note("errors", "binance depth: snapshot does not join the stream");
        this.syncTries = 0;
        this.syncAt = Infinity;
      }
    } catch (err) {
      this.note("errors", `binance depth snapshot: ${err}`);
      this.syncAt = Infinity;
    } finally {
      this.syncing = false;
    }
  }

  // ---------- alarm hooks ----------

  protected override async ensureStreams() {
    this.flushRun();
    const now = Date.now();
    this.expireCalls(now);
    // The relay sends a heartbeat every 20 s besides Binance's own messages.
    if (this.relay && now - this.relay.last > SILENT_MS) {
      this.note("gaps", "relay silent, dropping");
      this.dropRelay("silent");
    }
    if (!this.relay) return;
    if (!this.book.ready) {
      this.syncAt = 0;
      void this.syncBook();
    }
    // Binance streams no open interest, so it is read every alarm; the reading-time rule then
    // records the value held at each 5-minute boundary, as with Bybit's tickers.
    try {
      const oi = await this.rest<{ openInterest: string; time: number }>(`/fapi/v1/openInterest?symbol=${this.m.symbol}`);
      const ts = Number(oi.time) || now;
      this.reading(ts);
      this.ticker.oi = Number(oi.openInterest);
      const mark = (this.ticker as { mark?: number }).mark ?? this.lastPrice;
      this.ticker.oiValue = mark ? this.ticker.oi * mark : undefined;
      this.ticker.ts = ts;
    } catch (err) {
      this.note("errors", `binance oi: ${err}`);
    }
  }

  protected override persistBars() {
    super.persistBars();
    if (this.aggId) this.setMeta("aggId", this.aggId);
  }

  protected override persistHeat() {
    this.book.recenter();
    super.persistHeat();
  }

  // History from Binance's 5-minute statistics (kept 30 days) and settled funding, one page per
  // kind per alarm until caught up, then every 5 minutes.
  protected override async pollRest() {
    if (!this.relay) return;
    const now = Date.now();
    const kinds = [
      ["oi", "openInterestHist"],
      ["ratio", "globalLongShortAccountRatio"],
      ["top_pos", "topLongShortPositionRatio"],
      ["top_acc", "topLongShortAccountRatio"],
      ["funding", "fundingRate"],
    ] as const;
    for (const [kind, path] of kinds) {
      const key = `${kind}Cursor`;
      let cursor = Number(this.meta(key) ?? 0) || now - BACKFILL_DAYS * DAY;
      const caughtUp = cursor > now - 15 * MINUTE;
      if (caughtUp && now - Number(this.meta(`${kind}Polled`) ?? 0) < FIVE_MIN) continue;
      if (caughtUp) cursor = now - 30 * MINUTE;
      const pageMs = kind === "funding" ? 1000 * 8 * 3_600_000 : 500 * FIVE_MIN;
      const end = Math.min(now, cursor + pageMs);
      const url =
        kind === "funding"
          ? `/fapi/v1/fundingRate?symbol=${this.m.symbol}&limit=1000&startTime=${cursor}&endTime=${end}`
          : `/futures/data/${path}?symbol=${this.m.symbol}&period=5m&limit=500&startTime=${cursor}&endTime=${end}`;
      try {
        for (const r of await this.rest<any[]>(url)) {
          const t = Number(r.timestamp ?? r.fundingTime);
          if (kind === "oi") this.sql.exec("INSERT OR REPLACE INTO oi_rest (t, oi) VALUES (?, ?)", t, Number(r.sumOpenInterest));
          else if (kind === "funding") this.sql.exec("INSERT OR REPLACE INTO funding (t, rate) VALUES (?, ?)", t, Number(r.fundingRate));
          else {
            const col = kind === "ratio" ? "ratio" : kind;
            this.sql.exec(`INSERT INTO ratios (t, ${col}) VALUES (?, ?) ON CONFLICT(t) DO UPDATE SET ${col} = excluded.${col}`, t, Number(r.longShortRatio));
          }
        }
        this.setMeta(key, Math.max(Number(this.meta(key) ?? 0), end - 10 * MINUTE));
        this.setMeta(`${kind}Polled`, now);
      } catch (err) {
        this.note("errors", `binance ${kind} history: ${err}`);
      }
    }
  }

  // Minutes the collector never saw get Binance's 1-minute klines, as with Bybit.
  protected override async fillKlines() {
    const now = Date.now();
    if (!this.relay || now - Number(this.meta("klinesFilled") ?? 0) < 3_600_000) return;
    const end = Math.floor(now / MINUTE) * MINUTE - 2 * MINUTE;
    try {
      for (let start = end - 2 * DAY; start < end; start += 1000 * MINUTE) {
        const stop = Math.min(end, start + 999 * MINUTE);
        const list = parseKlines(await this.rest(`/fapi/v1/klines?symbol=${this.m.symbol}&interval=1m&limit=1000&startTime=${start}&endTime=${stop}`));
        for (const [t, o, h, l, c] of list) this.sql.exec("INSERT OR IGNORE INTO bars (t, src, row) VALUES (?, 'kline', ?)", t, JSON.stringify([t, o, h, l, c, []]));
      }
      this.setMeta("klinesFilled", now);
    } catch (err) {
      this.note("errors", `binance kline fill: ${err}`);
    }
  }

  protected override healthFeeds(now: number): [keyof typeof HEALTH_DOWN_MS, boolean, number][] {
    return [["Binance", this.relay != null && now - this.lastTradeT < HEALTH_DOWN_MS.Binance, this.lastTradeT]];
  }

  protected override liveStatus() {
    return { binance: this.relayState, lastTrade: this.lastTradeT };
  }

  override publicStatus() {
    const { bybit, okx, ...rest } = super.publicStatus();
    return { ...rest, binance: this.relayState, relay: this.relay?.info ?? null, aggId: this.aggId, open: this.relay ? ["relay"] : [] };
  }

  override async fetch(request: Request): Promise<Response> {
    if (new URL(request.url).pathname === "/relay") {
      await this.wake();
      return this.acceptRelay(request);
    }
    return super.fetch(request);
  }
}
