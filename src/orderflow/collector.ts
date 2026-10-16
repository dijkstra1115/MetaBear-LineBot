// Order-flow collector: one Durable Object holding Bybit's BTCUSDT streams (trades, 1,000-level
// book, tickers, liquidations) plus OKX liquidations, writing footprint bars, large prints,
// heatmap columns, OI and funding readings and liquidations to its SQLite storage. Binance refuses Cloudflare, see
// docs/ORDERFLOW-CF-PROBE.md, which also explains the 10 s alarm: open outbound sockets alone
// keep an object alive for at most 15 minutes.
import { DurableObject } from "cloudflare:workers";
import { LIQ_FEEDS } from "../../public/lab/orderflow/liquidations.js";
import { ALERT_DEFAULTS, IcebergWatch, LiqWatch, OiWatch, WallWatch, describe, watchPrint } from "../../public/lab/orderflow/watch.js";
import {
  ArchiveDay,
  BOOK_CHUNK_MS,
  BOOK_STEP_MS,
  BOOK_TICK,
  BOOK_TOPIC,
  OrderBook,
  PING,
  PRINT_MIN,
  REST_URL,
  SYMBOL,
  TICK,
  TICKER_TOPIC,
  TRADE_TOPIC,
  WS_URL,
  addTrade,
  applyTicker,
  archiveUrl,
  barRow,
  groupPrints,
  parseRestTrades,
  parseTrades,
  takerTotals,
} from "../../public/lab/orderflow/bybit.js";

export interface OrderflowEnv {
  COLLECTOR: DurableObjectNamespace<Collector>;
  ORDERFLOW_ADMIN_TOKEN?: string;
  ORDERFLOW_STREAMS?: string; // "off" keeps the object from connecting (tests)
  // Alerts go to the admin's LINE through the CRM backend, which holds the LINE token:
  // "live" sends, "log" only records them (the default, also for local dev).
  ORDERFLOW_ALERTS?: string;
  ORDERFLOW_ALERT_TOKEN?: string;
  BACKEND?: Fetcher;
}

// Alert delivery: queued events are merged into one LINE message at most once a minute, at most
// ALERT_DAILY_CAP messages per Taipei day, so a busy market cannot use up the account's quota.
const ALERT_EVERY_MS = 60_000;
const ALERT_DAILY_CAP = 30;
const ALERT_LINES = 8;
const ALERT_FRESH_MS = 120_000; // trades and liquidations replayed after a reconnect are not news
type AlertConfig = typeof ALERT_DEFAULTS;
type AlertEvent = { kind: string; t: number; [k: string]: unknown };

const MINUTE = 60_000;
const FIVE_MIN = 5 * MINUTE;
const DAY = 86_400_000;
const ALARM_MS = 10_000;
const SILENT_MS = 30_000;
const SEEN_TRADES = 5_000; // trade ids kept to drop duplicates between the stream and a REST backfill
// Order flow is read over hours to days, so storage stays small: a month of footprints, prints,
// readings and liquidations, and a week of heatmap columns (the largest rows, ~3 KB a minute).
export const KEEP_MS = { bars: 30 * DAY, prints: 30 * DAY, heat: 30 * DAY, book: 30 * DAY, readings: 30 * DAY, liqs: 30 * DAY, alerts: 30 * DAY };
const BACKFILL_DAYS = 15; // OI, long/short ratio and funding history fetched from REST
const LIQ_TOPIC = `allLiquidation.${SYMBOL}`;
const BYBIT_LIQ = LIQ_FEEDS.find((f) => f.ex === "bybit")!;
const OKX_LIQ = LIQ_FEEDS.find((f) => f.ex === "okx")!;
// Daily archive import. Bybit published 10/14's file at about 01:10 UTC, so a day is first tried
// an hour after it ends and then every 15 minutes until the file is there. A busy day (1.9 M
// trades, 72 MB gzip) parses in about 1.3 s with a 14 MB heap; it is still split into slices of
// lines, one per alarm (about 0.75 s each in workerd), so a far busier day stays inside the
// per-invocation CPU limit.
const ARCHIVE_DUE = 3_600_000;
const ARCHIVE_WAIT = 15 * MINUTE;
const ARCHIVE_LATE = 6 * 3_600_000; // a file still missing this long after the day is reported as an error
const ARCHIVE_SLICE = 400_000; // lines per alarm
const ARCHIVE_NEXT_MS = 1_000; // alarm spacing while a day is being imported
const ARCHIVE_CATCHUP = 3; // days the importer goes back for after an outage

type Bar = { o: number; h: number; l: number; c: number; levels: Map<number, [number, number]>; first: number; last: number };
type Socket = { ws: WebSocket; last: number; ping: ReturnType<typeof setInterval> | null };
type Trade = { id: string; t: number; price: number; qty: number; sell: boolean };
type Row = Record<string, SqlStorageValue>;
// An archive day being streamed. Minutes before `cursor` are written; `open` is the minute
// still being built. The reader stays open across alarms.
type ArchiveJob = { day: string; from: number; cursor: number; open: number; reader: ReadableStreamDefaultReader<string>; build: ArchiveDay; carry: string };

const iso = (t: number) => new Date(t).toISOString();
// A stalled archive download must not hold up the alarm that also persists the live minutes.
const within = <T>(p: Promise<T>, ms: number, what: string) =>
  new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${what} timed out`)), ms);
    p.then(resolve, reject).finally(() => clearTimeout(timer));
  });

export class Collector extends DurableObject<OrderflowEnv> {
  private sql: SqlStorage;
  private bars = new Map<number, Bar>(); // minutes not yet closed and persisted
  private book = new OrderBook();
  private ticker: { oi?: number; oiValue?: number; funding?: number; ts?: number } = {};
  private sockets = new Map<string, Socket>();
  private seen = new Set<string>();
  private heat: [number, number, number, number[]] | null = null; // latest column of the current minute
  private lastTradeT = 0;
  private lastPrice = 0;
  private alertConfig: AlertConfig = { ...ALERT_DEFAULTS };
  private liqWatch = new LiqWatch(this.alertConfig);
  private oiWatch = new OiWatch(this.alertConfig);
  private wallWatch = new WallWatch(this.alertConfig);
  private iceWatch = new IcebergWatch(this.alertConfig);
  private archive: ArchiveJob | null = null;
  private status = { boot: Date.now(), bybit: "idle", okx: "idle", gaps: [] as string[], errors: [] as string[], archive: null as Record<string, unknown> | null };

  constructor(ctx: DurableObjectState, env: OrderflowEnv) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS bars (t INTEGER PRIMARY KEY, src TEXT NOT NULL, row TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS heat (t INTEGER PRIMARY KEY, row TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS book (t INTEGER PRIMARY KEY, row TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS alerts (id INTEGER PRIMARY KEY AUTOINCREMENT, t INTEGER, kind TEXT, text TEXT, state TEXT);
      CREATE TABLE IF NOT EXISTS oi (t INTEGER PRIMARY KEY, oi REAL, oi_value REAL, taker REAL);
      CREATE TABLE IF NOT EXISTS oi_rest (t INTEGER PRIMARY KEY, oi REAL);
      CREATE TABLE IF NOT EXISTS ratios (t INTEGER PRIMARY KEY, ratio REAL);
      CREATE TABLE IF NOT EXISTS liqs (t INTEGER, side TEXT, price REAL, qty REAL, ex TEXT, PRIMARY KEY (t, side, price, qty, ex));
      CREATE TABLE IF NOT EXISTS prints (t INTEGER, side TEXT, price REAL, qty REAL, PRIMARY KEY (t, side, price, qty));
      CREATE TABLE IF NOT EXISTS funding (t INTEGER PRIMARY KEY, rate REAL);
      CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT);
    `);
    // Added after the first deploy: the funding rate held at each OI reading.
    if (!this.rows("PRAGMA table_info(oi)").some((c) => c.name === "funding")) this.sql.exec("ALTER TABLE oi ADD COLUMN funding REAL");
    // The current minute is persisted every alarm; pick it back up so a restart only loses
    // the seconds since then, which the REST backfill on reconnect fills in.
    this.lastTradeT = Number(this.meta("lastTradeT") ?? 0);
    this.loadAlertConfig();
    // The OI watcher compares a change with the last day's, so replay the stored readings.
    for (const r of this.rows("SELECT t, oi FROM oi WHERE t >= ? ORDER BY t", Date.now() - DAY)) this.oiWatch.add(Number(r.t), Number(r.oi), 0);
    for (const r of this.rows("SELECT t, row FROM bars WHERE src = 'live' AND t >= ?", Math.floor(Date.now() / MINUTE) * MINUTE - MINUTE)) {
      const [t, o, h, l, c, levels] = JSON.parse(String(r.row));
      this.bars.set(t, { o, h, l, c, levels: new Map(levels.map(([bin, b, s]: number[]) => [bin, [b, s]])), first: t, last: Math.max(t, this.lastTradeT) });
    }
  }

  // ---------- storage helpers ----------

  private rows(query: string, ...args: SqlStorageValue[]): Row[] {
    return [...this.sql.exec(query, ...args)] as Row[];
  }

  private meta(k: string): string | null {
    const [r] = this.rows("SELECT v FROM meta WHERE k = ?", k);
    return r ? String(r.v) : null;
  }

  private setMeta(k: string, v: string | number) {
    this.sql.exec("INSERT INTO meta (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v", k, String(v));
  }

  private note(kind: "gaps" | "errors", text: string) {
    const list = this.status[kind];
    list.unshift(`${iso(Date.now()).slice(0, 19)} ${text}`);
    list.length = Math.min(list.length, 20);
    if (kind === "errors") console.error(JSON.stringify({ event: "orderflow_collector_error", detail: text }));
  }

  // ---------- streams ----------

  private streamsOn() {
    return this.env.ORDERFLOW_STREAMS !== "off";
  }

  private async openStream(name: "bybit" | "okx") {
    const url = name === "bybit" ? WS_URL : OKX_LIQ.url;
    let res: Response;
    try {
      // No AbortSignal: it stays attached to the upgraded socket and would cut it later.
      res = await fetch(url.replace(/^wss:/, "https:"), { headers: { Upgrade: "websocket" } });
    } catch (err) {
      this.status[name] = "error";
      this.note("errors", `${name} connect: ${err}`);
      return;
    }
    const ws = res.webSocket;
    if (!ws) {
      this.status[name] = `rejected ${res.status}`;
      this.note("errors", `${name} rejected: HTTP ${res.status}`);
      return;
    }
    ws.accept();
    const sock: Socket = { ws, last: Date.now(), ping: null };
    this.sockets.set(name, sock);
    this.status[name] = "open";
    if (name === "bybit") {
      this.book.reset();
      ws.send(JSON.stringify({ op: "subscribe", args: [TRADE_TOPIC, BOOK_TOPIC, TICKER_TOPIC, LIQ_TOPIC] }));
      sock.ping = setInterval(() => ws.send(PING), 20_000);
    } else {
      ws.send(JSON.stringify(OKX_LIQ.subscribe));
      sock.ping = setInterval(() => ws.send(OKX_LIQ.ping!), 20_000);
    }
    ws.addEventListener("message", (e) => {
      if (this.sockets.get(name) !== sock) return;
      sock.last = Date.now();
      const text = typeof e.data === "string" ? e.data : new TextDecoder().decode(e.data);
      if (text === "pong") return;
      try {
        if (name === "bybit") this.onBybit(JSON.parse(text));
        else this.saveLiqs(OKX_LIQ.parse(JSON.parse(text)));
      } catch (err) {
        this.note("errors", `${name} message: ${err}`);
      }
    });
    const dropped = (why: string) => {
      if (this.sockets.get(name) !== sock) return;
      if (sock.ping) clearInterval(sock.ping);
      this.sockets.delete(name);
      this.status[name] = `closed ${why}`;
    };
    ws.addEventListener("close", (e) => dropped(String(e.code)));
    ws.addEventListener("error", () => dropped("error"));
    if (name === "bybit") await this.backfillTrades();
  }

  private async ensureStreams() {
    for (const name of ["bybit", "okx"] as const) {
      const sock = this.sockets.get(name);
      if (sock && Date.now() - sock.last > SILENT_MS) {
        this.note("gaps", `${name} silent, reconnecting`);
        if (sock.ping) clearInterval(sock.ping);
        this.sockets.delete(name);
        try {
          sock.ws.close(1000, "silent");
        } catch {}
      }
      if (!this.sockets.has(name)) await this.openStream(name);
    }
  }

  private onBybit(m: any) {
    if (m.topic === TRADE_TOPIC) this.addTrades(parseTrades(m));
    else if (m.topic === BOOK_TOPIC) this.book.apply(m);
    else if (m.topic === TICKER_TOPIC) this.onTicker(m);
    else if (m.topic === LIQ_TOPIC) this.saveLiqs(BYBIT_LIQ.parse(m));
  }

  private addTrades(trades: Trade[]) {
    const fresh: Trade[] = [];
    for (const tr of trades) {
      if (this.seen.has(tr.id)) continue;
      this.seen.add(tr.id);
      if (this.seen.size > SEEN_TRADES) this.seen.delete(this.seen.values().next().value!);
      addTrade(this.bars, tr, TICK);
      if (tr.t > this.lastTradeT) (this.lastTradeT = tr.t), (this.lastPrice = tr.price);
      fresh.push(tr);
      this.wallWatch.trade(tr.price);
      // The book has not seen this fill yet, so it shows the size the trade met.
      this.iceWatch.trade(tr.t, tr.price, tr.qty, tr.sell, (tr.sell ? this.book.bids : this.book.asks).get(tr.price) ?? 0);
    }
    const now = Date.now();
    for (const print of groupPrints(fresh)) {
      const [t, side, price, qty] = print;
      if (qty < PRINT_MIN) continue;
      this.sql.exec("INSERT OR IGNORE INTO prints VALUES (?, ?, ?, ?)", t, side, price, qty);
      if (t > now - ALERT_FRESH_MS) this.alert(watchPrint(print, this.alertConfig));
    }
  }

  // Trades missed while the socket was down: Bybit serves the latest 1,000 (about one to two
  // minutes of BTC), so longer outages leave a gap, recorded in the status.
  private async backfillTrades() {
    if (!this.lastTradeT) return;
    try {
      const res = await fetch(`${REST_URL}/v5/market/recent-trade?category=linear&symbol=${SYMBOL}&limit=1000`);
      const list: Trade[] = parseRestTrades(((await res.json()) as any).result.list);
      const oldest = Math.min(...list.map((tr) => tr.t));
      if (oldest > this.lastTradeT) this.note("gaps", `trades ${iso(this.lastTradeT).slice(11, 19)}–${iso(oldest).slice(11, 19)} missing`);
      const since = this.lastTradeT;
      // REST lists newest first; prints group consecutive fills in time order.
      this.addTrades(list.filter((tr) => tr.t >= since).sort((a, b) => a.t - b.t));
    } catch (err) {
      this.note("errors", `trade backfill: ${err}`);
    }
  }

  // OI is read at 5-minute boundaries in reading time (public/lab/orderflow/metrics.js): the
  // first ticker message past a boundary records the value held just before it.
  private onTicker(m: any) {
    const ts = Number(m.ts);
    const prev = this.ticker.ts;
    if (prev && this.ticker.oi != null && Math.floor(ts / FIVE_MIN) > Math.floor(prev / FIVE_MIN)) {
      const t = Math.floor(ts / FIVE_MIN) * FIVE_MIN;
      this.persistBars();
      const window = this.rows("SELECT row FROM bars WHERE t >= ? AND t < ?", t - FIVE_MIN, t).map((r) => JSON.parse(String(r.row)));
      const [buy, sell] = takerTotals(window);
      this.sql.exec(
        "INSERT INTO oi (t, oi, oi_value, taker, funding) VALUES (?, ?, ?, ?, ?) ON CONFLICT(t) DO NOTHING",
        t,
        this.ticker.oi,
        this.ticker.oiValue ?? null,
        sell > 0 ? Math.round((buy / sell) * 1e4) / 1e4 : null,
        this.ticker.funding ?? null,
      );
      this.alert(this.oiWatch.add(t, this.ticker.oi, this.lastPrice));
    }
    applyTicker(this.ticker, m);
    this.ticker.ts = ts;
  }

  private saveLiqs(rows: [number, string, number, number, string][]) {
    const now = Date.now();
    for (const row of rows) {
      const [t, side, price, qty, ex] = row;
      this.sql.exec("INSERT OR IGNORE INTO liqs VALUES (?, ?, ?, ?, ?)", t, side, price, qty, ex);
      if (t > now - ALERT_FRESH_MS) this.alert(this.liqWatch.add(row));
    }
  }

  // ---------- alerts ----------

  private loadAlertConfig() {
    const saved = JSON.parse(this.meta("alertConfig") ?? "{}") as Partial<AlertConfig>;
    // The watchers hold this object, so tuning takes effect without a restart.
    Object.assign(this.alertConfig, ALERT_DEFAULTS);
    for (const [k, v] of Object.entries(saved)) if (k in ALERT_DEFAULTS && Number.isFinite(v) && (v as number) > 0) (this.alertConfig as Record<string, number>)[k] = v as number;
  }

  private alert(e: AlertEvent | null) {
    if (!e) return;
    this.sql.exec("INSERT INTO alerts (t, kind, text, state) VALUES (?, ?, ?, 'pending')", e.t, e.kind, describe(e));
  }

  // Walls and icebergs need the book after updates; checked every alarm.
  private watchBook() {
    if (!this.book.ready) return;
    const now = Date.now();
    for (const e of this.wallWatch.check(now, this.book.bids, this.book.asks)) this.alert(e);
    for (const e of this.iceWatch.check(now, this.book.bids, this.book.asks)) this.alert(e);
  }

  private async flushAlerts() {
    const mode = this.env.ORDERFLOW_ALERTS ?? "log";
    const pending = this.rows("SELECT id, t, text FROM alerts WHERE state = 'pending' ORDER BY id");
    if (!pending.length) return;
    const ids = (list: Row[]) => list.map((r) => Number(r.id));
    const mark = (list: number[], state: string) => {
      for (const id of list) this.sql.exec("UPDATE alerts SET state = ? WHERE id = ?", state, id);
    };
    if (mode !== "live" || !this.env.BACKEND || !this.env.ORDERFLOW_ALERT_TOKEN) {
      for (const r of pending) console.log(JSON.stringify({ event: "orderflow_alert", kind: "logged", text: r.text }));
      mark(ids(pending), "logged");
      return;
    }
    const now = Date.now();
    if (now - Number(this.meta("alertSentAt") ?? 0) < ALERT_EVERY_MS) return;
    const day = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Taipei" }).format(now);
    const sentToday = this.meta("alertDay") === day ? Number(this.meta("alertCount") ?? 0) : 0;
    if (sentToday >= ALERT_DAILY_CAP) {
      mark(ids(pending), "capped");
      return;
    }
    const lines = pending.slice(0, ALERT_LINES).map((r) => String(r.text));
    if (pending.length > ALERT_LINES) lines.push(`…另有 ${pending.length - ALERT_LINES} 則`);
    const at = Math.floor(Number(pending[0].t) / MINUTE) * MINUTE;
    const text = [
      "MetaBear 訂單流通知",
      ...lines,
      `https://metabear.io/lab/orderflow/?tf=1&at=${at}`,
      sentToday + 1 === ALERT_DAILY_CAP ? "今天的通知已達上限，之後的事件只記錄不推送。" : "",
      "盤面事件，不是買賣建議。",
    ]
      .filter(Boolean)
      .join("\n");
    try {
      const res = await this.env.BACKEND.fetch("https://backend/api/internal/orderflow-alert", {
        method: "POST",
        headers: { authorization: `Bearer ${this.env.ORDERFLOW_ALERT_TOKEN}`, "content-type": "application/json" },
        body: JSON.stringify({ text, key: `orderflow-${pending[0].id}` }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status} ${(await res.text()).slice(0, 120)}`);
      const result = (await res.json()) as { sent?: boolean; reason?: string };
      // The backend answers sent: false when its LINE delivery is switched off.
      if (!result.sent) {
        mark(ids(pending), "undelivered");
        this.note("errors", `alert delivery: ${result.reason ?? "not sent"}`);
        return;
      }
      mark(ids(pending), "sent");
      this.setMeta("alertSentAt", now);
      this.setMeta("alertDay", day);
      this.setMeta("alertCount", sentToday + 1);
    } catch (err) {
      this.note("errors", `alert delivery: ${err}`);
      this.setMeta("alertSentAt", now); // retry next minute
    }
  }

  private alertsView() {
    const day = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Taipei" }).format(Date.now());
    return {
      mode: this.env.ORDERFLOW_ALERTS ?? "log",
      config: this.alertConfig,
      defaults: ALERT_DEFAULTS,
      sentToday: this.meta("alertDay") === day ? Number(this.meta("alertCount") ?? 0) : 0,
      dailyCap: ALERT_DAILY_CAP,
      recent: this.rows("SELECT id, t, kind, text, state FROM alerts ORDER BY id DESC LIMIT 50").map((r) => ({ ...r, t: iso(Number(r.t)) })),
    };
  }

  // ---------- persistence ----------

  private persistBars() {
    const current = Math.floor(Date.now() / MINUTE) * MINUTE;
    for (const [t, bar] of this.bars) {
      // An archive import is authoritative for its minutes.
      this.sql.exec(
        "INSERT INTO bars (t, src, row) VALUES (?, 'live', ?) ON CONFLICT(t) DO UPDATE SET src = 'live', row = excluded.row WHERE bars.src != 'archive'",
        t,
        JSON.stringify(barRow(t, bar)),
      );
      // Keep the last closed minute a little longer for late REST backfill trades.
      if (t < current - MINUTE) this.bars.delete(t);
    }
    if (this.lastTradeT) this.setMeta("lastTradeT", this.lastTradeT);
  }

  private persistHeat() {
    const col = this.book.column();
    if (!col) return;
    const now = Date.now();
    const minute = Math.floor(now / MINUTE) * MINUTE;
    // One coarse column per minute (the latest snapshot in it) for long views, and the whole book
    // at $1 every 10 s for detail. A fine row is about 2 KB, about 520 MB over 30 days.
    this.heat = [minute, ...col] as [number, number, number, number[]];
    this.sql.exec("INSERT INTO heat (t, row) VALUES (?, ?) ON CONFLICT(t) DO UPDATE SET row = excluded.row", minute, JSON.stringify(this.heat));
    const fine = this.book.span(BOOK_TICK);
    const slot = Math.floor(now / BOOK_STEP_MS) * BOOK_STEP_MS;
    if (fine) this.sql.exec("INSERT OR REPLACE INTO book (t, row) VALUES (?, ?)", slot, JSON.stringify([slot, ...fine]));
  }

  // OI and account long/short ratio history from REST, one page per alarm, then every 5 minutes
  // to fill readings the stream missed. Bybit's ratio is accounts long ÷ accounts short.
  private async pollRest() {
    const now = Date.now();
    for (const [kind, pageMs] of [["oi", 200 * FIVE_MIN], ["ratio", 500 * FIVE_MIN], ["funding", 200 * 8 * 3_600_000]] as const) {
      const key = `${kind}Cursor`;
      let cursor = Number(this.meta(key) ?? 0) || now - BACKFILL_DAYS * DAY;
      const caughtUp = cursor > now - 15 * MINUTE;
      if (caughtUp && now - Number(this.meta(`${kind}Polled`) ?? 0) < FIVE_MIN) continue;
      if (caughtUp) cursor = now - 30 * MINUTE;
      const end = Math.min(now, cursor + pageMs);
      const url = {
        oi: `${REST_URL}/v5/market/open-interest?category=linear&symbol=${SYMBOL}&intervalTime=5min&limit=200&startTime=${cursor}&endTime=${end}`,
        ratio: `${REST_URL}/v5/market/account-ratio?category=linear&symbol=${SYMBOL}&period=5min&limit=500&startTime=${cursor}&endTime=${end}`,
        // Settled rates, every 8 hours.
        funding: `${REST_URL}/v5/market/funding/history?category=linear&symbol=${SYMBOL}&limit=200&startTime=${cursor}&endTime=${end}`,
      }[kind];
      try {
        const res = await fetch(url);
        const body = (await res.json()) as any;
        if (body.retCode !== 0) throw new Error(`${body.retCode} ${body.retMsg}`);
        for (const r of body.result.list) {
          if (kind === "oi") this.sql.exec("INSERT OR REPLACE INTO oi_rest (t, oi) VALUES (?, ?)", Number(r.timestamp), Number(r.openInterest));
          else if (kind === "funding") this.sql.exec("INSERT OR REPLACE INTO funding (t, rate) VALUES (?, ?)", Number(r.fundingRateTimestamp), Number(r.fundingRate));
          else this.sql.exec("INSERT OR REPLACE INTO ratios (t, ratio) VALUES (?, ?)", Number(r.timestamp), Math.round((Number(r.buyRatio) / Number(r.sellRatio)) * 1e4) / 1e4);
        }
        this.setMeta(key, Math.max(Number(this.meta(key) ?? 0), end - 10 * MINUTE));
        this.setMeta(`${kind}Polled`, now);
      } catch (err) {
        this.note("errors", `${kind} history: ${err}`);
      }
    }
  }

  // Minutes the collector never saw (before it started, or a long outage) get Bybit's 1-minute
  // klines: price only, no footprint or taker split, so the lab marks them partial. Live and
  // archive rows replace them.
  private async fillKlines() {
    const now = Date.now();
    if (now - Number(this.meta("klinesFilled") ?? 0) < 3_600_000) return;
    const end = Math.floor(now / MINUTE) * MINUTE - 2 * MINUTE;
    try {
      for (let start = end - 2 * DAY; start < end; start += 1000 * MINUTE) {
        const stop = Math.min(end, start + 999 * MINUTE);
        const res = await fetch(`${REST_URL}/v5/market/kline?category=linear&symbol=${SYMBOL}&interval=1&limit=1000&start=${start}&end=${stop}`);
        const body = (await res.json()) as any;
        if (body.retCode !== 0) throw new Error(`${body.retCode} ${body.retMsg}`);
        for (const [t, o, h, l, c] of body.result.list as string[][])
          this.sql.exec("INSERT OR IGNORE INTO bars (t, src, row) VALUES (?, 'kline', ?)", Number(t), JSON.stringify([Number(t), Number(o), Number(h), Number(l), Number(c), []]));
      }
      this.setMeta("klinesFilled", now);
    } catch (err) {
      this.note("errors", `kline fill: ${err}`);
    }
  }

  // ---------- daily trade archive ----------

  // Archive rows are authoritative over live and kline rows; prints in [from, to) are replaced.
  private writeArchive(rows: unknown[][], prints?: { from: number; to: number; list: [number, string, number, number][] }) {
    for (const row of rows) this.sql.exec("INSERT INTO bars (t, src, row) VALUES (?, 'archive', ?) ON CONFLICT(t) DO UPDATE SET src = 'archive', row = excluded.row", row[0] as number, JSON.stringify(row));
    if (!prints) return;
    this.sql.exec("DELETE FROM prints WHERE t >= ? AND t < ?", prints.from, prints.to);
    for (const [t, side, price, qty] of prints.list) if (t >= prints.from && t < prints.to) this.sql.exec("INSERT OR IGNORE INTO prints VALUES (?, ?, ?, ?)", t, side, price, qty);
  }

  // The day to import next: the one after the last imported, at most ARCHIVE_CATCHUP days back,
  // and only once its file is due.
  private archiveDue(now: number) {
    const latest = Math.floor((now - ARCHIVE_DUE) / DAY) * DAY - DAY;
    const done = this.meta("archiveDone");
    const next = Math.max(done ? Date.parse(`${done}T00:00:00Z`) + DAY : latest, latest - (ARCHIVE_CATCHUP - 1) * DAY);
    return next <= latest ? next : null;
  }

  private archiveRetry(day: string, wait: number, state: string, error?: string) {
    const at = Date.now() + wait;
    this.setMeta("archiveRetryAt", at);
    this.status.archive = { day, state, retry: iso(at) };
    if (error) this.note("errors", `archive ${day}: ${error}`);
  }

  private archiveFailed(day: string, error: string) {
    const attempts = Number(this.meta("archiveAttempts") ?? 0) + 1;
    this.setMeta("archiveAttempts", attempts);
    this.archiveRetry(day, Math.min(attempts * 5 * MINUTE, 60 * MINUTE), "retrying", error);
  }

  private async startArchive(now: number) {
    const from = this.archiveDue(now);
    if (from == null || now < Number(this.meta("archiveRetryAt") ?? 0)) return null;
    const day = iso(from).slice(0, 10);
    // After a failure or a restart, minutes already written are skipped.
    const saved = JSON.parse(this.meta("archiveCursor") ?? "null") as { day: string; t: number } | null;
    const cursor = saved?.day === day ? saved.t : from;
    let res: Response;
    try {
      // Bybit's CloudFront refuses requests without a User-Agent (403), which Workers omit.
      res = await within(fetch(archiveUrl(day), { headers: { "user-agent": "metabear-orderflow (+https://metabear.io)" } }), 30_000, "fetch");
    } catch (err) {
      this.archiveFailed(day, `fetch: ${err}`);
      return null;
    }
    // Bybit answers 404 until the file is published.
    if (res.status === 404) {
      await res.body?.cancel();
      this.archiveRetry(day, ARCHIVE_WAIT, "waiting", now > from + DAY + ARCHIVE_LATE ? `still missing (HTTP ${res.status})` : undefined);
      return null;
    }
    if (!res.ok || !res.body) {
      await res.body?.cancel();
      this.archiveFailed(day, `HTTP ${res.status}`);
      return null;
    }
    const reader = res.body.pipeThrough(new DecompressionStream("gzip")).pipeThrough(new TextDecoderStream()).getReader();
    this.status.archive = { day, state: "importing", from: iso(cursor) };
    return (this.archive = { day, from, cursor, open: cursor, reader, build: new ArchiveDay(), carry: "" });
  }

  // Writes the finished minutes before `before` (all of them at the end of the file) and
  // replaces the prints from the cursor up to it.
  private flushArchive(job: ArchiveJob, before: number, end = false) {
    const { rows, prints } = job.build.take(end ? Infinity : before);
    this.writeArchive(rows, { from: job.cursor, to: before, list: prints });
    job.cursor = before;
  }

  private archiveLine(job: ArchiveJob, line: string) {
    // The header parses as NaN and passes through; add() skips it.
    const t = Math.round(Number(line.slice(0, line.indexOf(","))) * 1000);
    if (t < job.cursor || t >= job.from + DAY) return;
    const minute = job.build.add(line);
    if (minute != null && minute > job.open) {
      this.flushArchive(job, minute);
      job.open = minute;
    }
  }

  // One slice of the day per alarm; the file is streamed and never held whole.
  private async importArchive() {
    const job = this.archive ?? (await this.startArchive(Date.now()));
    if (!job) return;
    try {
      for (let lines = 0; lines < ARCHIVE_SLICE; ) {
        const { value, done } = await within(job.reader.read(), 30_000, "read");
        if (done) {
          if (job.carry) this.archiveLine(job, job.carry);
          this.flushArchive(job, job.from + DAY, true);
          this.archive = null;
          this.setMeta("archiveDone", job.day);
          this.sql.exec("DELETE FROM meta WHERE k IN ('archiveCursor', 'archiveAttempts', 'archiveRetryAt')");
          this.status.archive = { day: job.day, state: "done", trades: job.build.trades, at: iso(Date.now()) };
          console.log(JSON.stringify({ event: "orderflow_archive_imported", day: job.day, trades: job.build.trades }));
          return;
        }
        const parts = (job.carry + value).split("\n");
        job.carry = parts.pop()!;
        for (const line of parts) this.archiveLine(job, line);
        lines += parts.length;
      }
      this.setMeta("archiveCursor", JSON.stringify({ day: job.day, t: job.cursor }));
      this.status.archive = { day: job.day, state: "importing", minute: iso(job.cursor), trades: job.build.trades };
    } catch (err) {
      this.archive = null;
      job.reader.cancel().catch(() => {});
      this.setMeta("archiveCursor", JSON.stringify({ day: job.day, t: job.cursor }));
      this.archiveFailed(job.day, `${err}`);
    }
  }

  private prune() {
    const now = Date.now();
    if (now - Number(this.meta("pruned") ?? 0) < 3_600_000) return;
    this.sql.exec("DELETE FROM bars WHERE t < ?", now - KEEP_MS.bars);
    this.sql.exec("DELETE FROM prints WHERE t < ?", now - KEEP_MS.prints);
    this.sql.exec("DELETE FROM heat WHERE t < ?", now - KEEP_MS.heat);
    this.sql.exec("DELETE FROM book WHERE t < ?", now - KEEP_MS.book);
    this.sql.exec("DELETE FROM alerts WHERE t < ?", now - KEEP_MS.alerts);
    for (const table of ["oi", "oi_rest", "ratios", "funding"]) this.sql.exec(`DELETE FROM ${table} WHERE t < ?`, now - KEEP_MS.readings);
    this.sql.exec("DELETE FROM liqs WHERE t < ?", now - KEEP_MS.liqs);
    this.setMeta("pruned", now);
  }

  // ---------- lifecycle ----------

  async alarm() {
    try {
      if (this.streamsOn()) {
        await this.ensureStreams();
        this.persistBars();
        this.persistHeat();
        await this.pollRest();
        await this.fillKlines();
        this.watchBook();
      }
      await this.flushAlerts();
      // Runs with the streams off too (tests); it only reads public.bybit.com.
      await this.importArchive();
      this.prune();
    } catch (err) {
      this.note("errors", `alarm: ${err}`);
    } finally {
      await this.ctx.storage.setAlarm(Date.now() + (this.archive ? ARCHIVE_NEXT_MS : ALARM_MS));
    }
  }

  private async wake() {
    if ((await this.ctx.storage.getAlarm()) == null) await this.ctx.storage.setAlarm(Date.now());
  }

  // ---------- queries ----------

  // Rows are stored as JSON text; responses are assembled from it without re-parsing.
  private series(from: number, to: number) {
    const bars = new Map<number, string>(this.rows("SELECT t, row FROM bars WHERE t >= ? AND t < ? ORDER BY t", from, to).map((r) => [Number(r.t), String(r.row)]));
    for (const [t, bar] of this.bars) if (t >= from && t < to) bars.set(t, JSON.stringify(barRow(t, bar)));
    const heat = new Map<number, string>(this.rows("SELECT t, row FROM heat WHERE t >= ? AND t < ? ORDER BY t", from, to).map((r) => [Number(r.t), String(r.row)]));
    if (this.heat && this.heat[0] >= from && this.heat[0] < to) heat.set(this.heat[0], JSON.stringify(this.heat));
    return {
      bars: `[${[...bars.entries()].sort((a, b) => a[0] - b[0]).map((e) => e[1]).join(",")}]`,
      heat: `[${[...heat.entries()].sort((a, b) => a[0] - b[0]).map((e) => e[1]).join(",")}]`,
      metrics: JSON.stringify(this.metrics(from, to)),
      liquidations: JSON.stringify(this.rows("SELECT t, side, price, qty, ex FROM liqs WHERE t >= ? AND t < ? ORDER BY t", from, to).map((r) => [r.t, r.side, r.price, r.qty, r.ex])),
      prints: JSON.stringify(this.rows("SELECT t, side, price, qty FROM prints WHERE t >= ? AND t < ? ORDER BY t", from, to).map((r) => [r.t, r.side, r.price, r.qty])),
    };
  }

  // Reading-time rows in the lab's shape: [t, OI (BTC), OI (USDT), top-trader position ratio,
  // top-trader account ratio, all-account ratio, taker buy/sell over [t − 5m, t), funding rate].
  // Bybit has no top-trader ratios. Stream readings win; REST rows fill the rest (OI valued at bar
  // close, funding as the last settled rate).
  private metrics(from: number, to: number) {
    const live = new Map(this.rows("SELECT t, oi, oi_value, taker, funding FROM oi WHERE t >= ? AND t < ?", from, to).map((r) => [Number(r.t), r]));
    const out = new Map<number, (number | null)[]>();
    for (const [t, r] of live)
      out.set(t, [t, r.oi as number, r.oi_value == null ? null : Math.round(r.oi_value as number), null, null, null, (r.taker as number | null) ?? null, (r.funding as number | null) ?? null]);
    const closes = new Map(this.rows("SELECT t, row FROM bars WHERE t >= ? AND t < ?", from - MINUTE, to).map((r) => [Number(r.t), JSON.parse(String(r.row))[4] as number]));
    for (const r of this.rows("SELECT t, oi FROM oi_rest WHERE t >= ? AND t < ?", from, to)) {
      const t = Number(r.t);
      if (out.has(t)) continue;
      const close = closes.get(t - MINUTE);
      out.set(t, [t, r.oi as number, close ? Math.round((r.oi as number) * close) : null, null, null, null, null, null]);
    }
    const ratios = this.rows("SELECT t, ratio FROM ratios WHERE t >= ? AND t < ? ORDER BY t", from - DAY, to);
    const settled = this.rows("SELECT t, rate FROM funding WHERE t >= ? AND t < ? ORDER BY t", from - DAY, to);
    const rows = [...out.values()].sort((a, b) => (a[0] as number) - (b[0] as number));
    let k = -1;
    let f = -1;
    for (const row of rows) {
      while (k + 1 < ratios.length && Number(ratios[k + 1].t) <= (row[0] as number)) k++;
      while (f + 1 < settled.length && Number(settled[f + 1].t) <= (row[0] as number)) f++;
      row[5] = k >= 0 ? (ratios[k].ratio as number) : null;
      row[7] ??= f >= 0 ? (settled[f].rate as number) : null;
    }
    return rows;
  }

  private respond(parts: Record<string, string>, extra: Record<string, unknown>) {
    const head = JSON.stringify({ symbol: SYMBOL, tick: TICK, source: "bybit", ...extra }).slice(0, -1);
    const body = `${head},${Object.entries(parts).map(([k, v]) => `"${k}":${v}`).join(",")}}`;
    return new Response(body, { headers: { "content-type": "application/json; charset=utf-8" } });
  }

  publicStatus() {
    return {
      ...this.status,
      boot: iso(this.status.boot),
      lastTrade: this.lastTradeT ? iso(this.lastTradeT) : null,
      bookReady: this.book.ready,
      open: [...this.sockets.keys()],
      oi: this.ticker.oi ?? null,
      archive: { last: this.meta("archiveDone"), ...this.status.archive },
      counts: Object.fromEntries(["bars", "prints", "heat", "book", "oi", "oi_rest", "ratios", "funding", "liqs"].map((t) => [t, Number(this.rows(`SELECT COUNT(*) AS n FROM ${t}`)[0].n)])),
    };
  }

  async fetch(request: Request): Promise<Response> {
    await this.wake();
    const url = new URL(request.url);
    const now = Date.now();
    if (url.pathname === "/wake") return new Response("ok");
    if (url.pathname === "/status") return Response.json(this.publicStatus());
    if (url.pathname === "/day") {
      const from = Date.parse(`${url.searchParams.get("d")}T00:00:00Z`);
      return this.respond(this.series(from, from + DAY), { day: url.searchParams.get("d"), updated: now });
    }
    if (url.pathname === "/recent") {
      const since = Number(url.searchParams.get("since"));
      return this.respond(this.series(since, now + MINUTE), { since, updated: now, status: { bybit: this.status.bybit, lastTrade: this.lastTradeT } });
    }
    if (url.pathname === "/alerts") {
      if (request.method === "POST") {
        // { config: { printBtc: 80, … } } tunes thresholds (null restores the defaults);
        // { test: true } queues a test message.
        const body = (await request.json()) as { config?: Record<string, number> | null; test?: boolean };
        if (body.config === null) this.sql.exec("DELETE FROM meta WHERE k = 'alertConfig'");
        else if (body.config) {
          const next = { ...JSON.parse(this.meta("alertConfig") ?? "{}") };
          for (const [k, v] of Object.entries(body.config)) if (k in ALERT_DEFAULTS && Number.isFinite(v) && v > 0) next[k] = v;
          this.setMeta("alertConfig", JSON.stringify(next));
        }
        this.loadAlertConfig();
        if (body.test) {
          this.alert({ kind: "test", t: now });
          this.sql.exec("DELETE FROM meta WHERE k = 'alertSentAt'");
          await this.flushAlerts();
        }
      }
      return Response.json(this.alertsView());
    }
    if (url.pathname === "/book") {
      // One 30-minute chunk of fine order-book columns.
      const from = Number(url.searchParams.get("from"));
      const rows = this.rows("SELECT row FROM book WHERE t >= ? AND t < ? ORDER BY t", from, from + BOOK_CHUNK_MS);
      return new Response(`{"from":${from},"step":${BOOK_STEP_MS},"tick":${BOOK_TICK},"columns":[${rows.map((r) => String(r.row)).join(",")}]}`, {
        headers: { "content-type": "application/json; charset=utf-8" },
      });
    }
    if (url.pathname === "/import" && request.method === "POST") {
      // Footprint rows rebuilt from Bybit's daily trade archive (scripts/orderflow-bybit-archive.mjs).
      // Prints come with the [from, to) range they cover, which they replace.
      const body = (await request.json()) as { rows?: [number, ...unknown[]][]; prints?: [number, string, number, number][]; from?: number; to?: number };
      const rows = body.rows ?? [];
      const prints = body.prints ?? [];
      const replace = prints.length > 0 || body.from != null;
      if (replace && (!Number.isInteger(body.from) || !Number.isInteger(body.to))) return Response.json({ error: "prints need from and to" }, { status: 400 });
      this.writeArchive(rows, replace ? { from: body.from!, to: body.to!, list: prints } : undefined);
      return Response.json({ imported: rows.length, prints: prints.length });
    }
    if (url.pathname === "/archive" && request.method === "POST") {
      // Try the pending archive day now instead of at the next retry.
      this.sql.exec("DELETE FROM meta WHERE k = 'archiveRetryAt'");
      if (!this.archive) await this.ctx.storage.setAlarm(now);
      return Response.json({ archive: { last: this.meta("archiveDone"), ...this.status.archive } });
    }
    return new Response("not found", { status: 404 });
  }
}
