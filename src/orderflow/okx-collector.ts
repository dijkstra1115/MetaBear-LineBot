// OKX BTC-USDT-SWAP collector (docs/ORDERFLOW-MULTI-EXCHANGE.md): trades, the 400-level book, open
// interest, funding and liquidations from OKX's public WebSocket; history from its REST and the
// daily trade archive (zipped, one file per Beijing-time day).
import { LIQ_FEEDS } from "../../public/lab/orderflow/liquidations.js";
import { OKX_CHANNELS, OKX_INST, OKX_REST, OKX_WS, OkxBook, okxArchiveUrl, parseOkxArchiveLine, parseOkxCandles, parseOkxTrades } from "../../public/lab/orderflow/okx.js";
import { BACKFILL_DAYS, DAY, FIVE_MIN, MINUTE, type Trade } from "./collector";
import { DirectCollector } from "./direct-collector";

const OKX_LIQ = LIQ_FEEDS.find((f) => f.ex === "okx")!;
const HOUR = 3_600_000;

export class OkxCollector extends DirectCollector {
  protected override book = new OkxBook();
  protected override source = "okx";
  protected wsUrl = OKX_WS;
  protected feed = "OKX" as const;
  protected override pingText = "ping";
  protected override archiveName = "OKX";
  protected override archiveOffset = -8 * HOUR;
  protected override archiveLateMs = 12 * HOUR;
  protected override archiveSource(day: string) {
    return { url: okxArchiveUrl(day), zip: true };
  }
  protected override archiveTrade(line: string) {
    return parseOkxArchiveLine(line);
  }

  private async get(path: string): Promise<any> {
    const res = await fetch(OKX_REST + path);
    const body = (await res.json()) as { code: string; msg: string; data: unknown };
    if (body.code !== "0") throw new Error(`${body.code} ${body.msg}`);
    return body.data;
  }

  protected subscribe(ws: WebSocket) {
    const args = [...OKX_CHANNELS.map((channel) => ({ channel, instId: OKX_INST })), ...OKX_LIQ.subscribe!.args];
    this.send(ws, { op: "subscribe", args });
  }

  protected onText(text: string, ws: WebSocket) {
    if (text === "pong") return;
    const m = JSON.parse(text);
    if (m.event === "error") return this.note("errors", `okx: ${m.code} ${m.msg}`);
    switch (m.arg?.channel) {
      case "trades":
        for (const tr of parseOkxTrades(m.data)) this.queueTrade(tr);
        break;
      case "books": {
        const changes = this.book.applyOkx(m);
        if (changes === "snapshot") this.spoofWatch.reset(Number(m.data[0].ts) || Date.now(), this.book.bids, this.book.asks);
        else if (changes === "resync") {
          // A broken chain: subscribe again for a fresh snapshot.
          this.note("gaps", "okx book chain broken, resubscribing");
          const arg = { channel: "books", instId: OKX_INST };
          this.send(ws, { op: "unsubscribe", args: [arg] });
          this.send(ws, { op: "subscribe", args: [arg] });
        } else if (changes?.length) this.watchChanges(Number(m.data[0].ts) || Date.now(), changes);
        break;
      }
      case "open-interest": {
        const d = m.data?.[0];
        if (!d) break;
        const ts = Number(d.ts);
        this.reading(ts);
        this.ticker.oi = Number(d.oiCcy);
        this.ticker.oiValue = Number(d.oiUsd);
        this.ticker.ts = ts;
        break;
      }
      case "funding-rate":
        if (m.data?.[0]) this.ticker.funding = Number(m.data[0].fundingRate);
        break;
      case "liquidation-orders":
        this.saveLiqs(OKX_LIQ.parse(m));
        break;
    }
  }

  // The latest 500 trades (a minute or two of BTC); longer outages are left to the archive.
  protected override async backfill() {
    if (!this.lastTradeT) return;
    try {
      const list: Trade[] = parseOkxTrades(await this.get(`/api/v5/market/trades?instId=${OKX_INST}&limit=500`));
      if (!list.length) return;
      const oldest = Math.min(...list.map((tr) => tr.t));
      if (oldest > this.lastTradeT) this.note("gaps", `okx trades ${new Date(this.lastTradeT).toISOString().slice(11, 19)}–${new Date(oldest).toISOString().slice(11, 19)} missing`);
      const since = this.lastTradeT;
      this.addTrades(list.filter((tr) => tr.t >= since).sort((a, b) => a.t - b.t));
    } catch (err) {
      this.note("errors", `okx trade backfill: ${err}`);
    }
  }

  // OI and all-account long/short history every 5 minutes (100 readings a page), and settled
  // funding, the latest 100 (about a month).
  protected override async pollRest() {
    const now = Date.now();
    for (const kind of ["oi", "ratio"] as const) {
      const key = `${kind}Cursor`;
      let cursor = Number(this.meta(key) ?? 0) || now - BACKFILL_DAYS * DAY;
      const caughtUp = cursor > now - 15 * MINUTE;
      if (caughtUp && now - Number(this.meta(`${kind}Polled`) ?? 0) < FIVE_MIN) continue;
      if (caughtUp) cursor = now - 30 * MINUTE;
      const end = Math.min(now, cursor + 100 * FIVE_MIN);
      const path = kind === "oi" ? "open-interest-history" : "long-short-account-ratio-contract";
      try {
        for (const r of (await this.get(`/api/v5/rubik/stat/contracts/${path}?instId=${OKX_INST}&period=5m&begin=${cursor}&end=${end}&limit=100`)) as string[][]) {
          if (kind === "oi") this.sql.exec("INSERT OR REPLACE INTO oi_rest (t, oi) VALUES (?, ?)", Number(r[0]), Number(r[2]));
          else this.sql.exec("INSERT INTO ratios (t, ratio) VALUES (?, ?) ON CONFLICT(t) DO UPDATE SET ratio = excluded.ratio", Number(r[0]), Number(r[1]));
        }
        this.setMeta(key, Math.max(Number(this.meta(key) ?? 0), end - 10 * MINUTE));
        this.setMeta(`${kind}Polled`, now);
      } catch (err) {
        this.note("errors", `okx ${kind} history: ${err}`);
      }
    }
    if (now - Number(this.meta("fundingPolled") ?? 0) < HOUR) return;
    try {
      for (const r of (await this.get(`/api/v5/public/funding-rate-history?instId=${OKX_INST}&limit=100`)) as { fundingTime: string; fundingRate: string }[])
        this.sql.exec("INSERT OR REPLACE INTO funding (t, rate) VALUES (?, ?)", Number(r.fundingTime), Number(r.fundingRate));
      this.setMeta("fundingPolled", now);
    } catch (err) {
      this.note("errors", `okx funding history: ${err}`);
    }
  }

  // Minutes the collector never saw get 1-minute candles, 100 a page going back two days, paced
  // under OKX's rate limit. OKX counts requests per IP and Cloudflare's outbound IPs are shared, so
  // a refusal waits 10 minutes instead of retrying every alarm.
  protected override async fillKlines() {
    const now = Date.now();
    if (now - Number(this.meta("klinesFilled") ?? 0) < HOUR || now < Number(this.meta("klinesRetryAt") ?? 0)) return;
    const end = Math.floor(now / MINUTE) * MINUTE - 2 * MINUTE;
    try {
      for (let after = end + MINUTE; after > end - 2 * DAY; after -= 100 * MINUTE) {
        const list = parseOkxCandles(await this.get(`/api/v5/market/history-candles?instId=${OKX_INST}&bar=1m&after=${after}&limit=100`));
        for (const [t, o, h, l, c] of list) if (t <= end) this.sql.exec("INSERT OR IGNORE INTO bars (t, src, row) VALUES (?, 'kline', ?)", t, JSON.stringify([t, o, h, l, c, []]));
        if (list.length < 100) break;
        await new Promise((r) => setTimeout(r, 500)); // history-candles allows 10 requests in 2 s per IP
      }
      this.setMeta("klinesFilled", now);
    } catch (err) {
      this.note("errors", `okx kline fill: ${err}`);
      this.setMeta("klinesRetryAt", now + 10 * MINUTE);
    }
  }
}
