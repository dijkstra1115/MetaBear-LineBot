// BingX BTC-USDT perpetual collector (docs/ORDERFLOW-MULTI-EXCHANGE.md): trades and the top-100 book
// from BingX's gzipped WebSocket; open interest and funding read over REST every alarm, since BingX
// streams neither. BingX publishes no trade archive, no long/short ratios and no liquidations.
import { BINGX_REST, BINGX_WS, BingxBook, bingxTopics, gunzipText, parseBingxKlines, parseBingxTrades } from "../../public/lab/orderflow/bingx.js";
import { BACKFILL_DAYS, DAY, MINUTE, type Trade } from "./collector";
import { DirectCollector } from "./direct-collector";

const HOUR = 3_600_000;

export class BingxCollector extends DirectCollector {
  protected override book = new BingxBook();
  protected override source = "bingx";
  protected wsUrl = BINGX_WS;
  protected feed = "BingX" as const;
  private mark = 0;
  private topics2 = bingxTopics(this.m.bingx);

  private async get(path: string): Promise<any> {
    const res = await fetch(BINGX_REST + path);
    const body = (await res.json()) as { code: number; msg: string; data: unknown };
    if (body.code !== 0) throw new Error(`${body.code} ${body.msg}`);
    return body.data;
  }

  protected override decode(data: string | ArrayBuffer) {
    return gunzipText(data) as Promise<string>;
  }

  protected subscribe(ws: WebSocket) {
    for (const dataType of this.topics2) this.send(ws, { id: dataType, reqType: "sub", dataType });
  }

  protected onText(text: string, ws: WebSocket) {
    if (text === "Ping") return this.send(ws, "Pong");
    const m = JSON.parse(text);
    if (!m.data) return;
    if (m.dataType === this.topics2[0]) for (const tr of parseBingxTrades(m.data)) this.queueTrade(tr);
    else if (m.dataType === this.topics2[1]) {
      const changes = this.book.load(m.data);
      if (changes === "snapshot") this.spoofWatch.reset(Number(m.ts) || Date.now(), this.book.bids, this.book.asks);
      else if (changes.length) this.watchChanges(Number(m.ts) || Date.now(), changes);
    }
  }

  protected override async backfill() {
    if (!this.lastTradeT) return;
    try {
      const list: Trade[] = parseBingxTrades(await this.get(`/openApi/swap/v2/quote/trades?symbol=${this.m.bingx}&limit=1000`));
      if (!list.length) return;
      const oldest = Math.min(...list.map((tr) => tr.t));
      if (oldest > this.lastTradeT) this.note("gaps", `bingx trades ${new Date(this.lastTradeT).toISOString().slice(11, 19)}–${new Date(oldest).toISOString().slice(11, 19)} missing`);
      const since = this.lastTradeT;
      this.addTrades(list.filter((tr) => tr.t >= since).sort((a, b) => a.t - b.t));
    } catch (err) {
      this.note("errors", `bingx trade backfill: ${err}`);
    }
  }

  // Open interest is a USDT value; it is held in BTC at the mark price, like the other exchanges.
  protected override async pollLive() {
    try {
      const [oi, premium] = await Promise.all([
        this.get(`/openApi/swap/v2/quote/openInterest?symbol=${this.m.bingx}`),
        this.get(`/openApi/swap/v2/quote/premiumIndex?symbol=${this.m.bingx}`),
      ]);
      this.mark = Number(premium.markPrice) || this.mark;
      this.ticker.funding = Number(premium.lastFundingRate);
      const ts = Number(oi.time) || Date.now();
      this.reading(ts);
      this.ticker.oiValue = Number(oi.openInterest);
      this.ticker.oi = this.mark ? this.ticker.oiValue / this.mark : undefined;
      this.ticker.ts = ts;
    } catch (err) {
      this.note("errors", `bingx oi: ${err}`);
    }
  }

  // Settled funding only; BingX has no OI history or long/short ratios.
  protected override async pollRest() {
    const now = Date.now();
    if (now - Number(this.meta("fundingPolled") ?? 0) < HOUR) return;
    try {
      for (const r of (await this.get(`/openApi/swap/v2/quote/fundingRate?symbol=${this.m.bingx}&startTime=${now - BACKFILL_DAYS * DAY}&endTime=${now}&limit=1000`)) as { fundingTime: number; fundingRate: string }[])
        this.sql.exec("INSERT OR REPLACE INTO funding (t, rate) VALUES (?, ?)", Number(r.fundingTime), Number(r.fundingRate));
      this.setMeta("fundingPolled", now);
    } catch (err) {
      this.note("errors", `bingx funding history: ${err}`);
    }
  }

  protected override async fillKlines() {
    const now = Date.now();
    if (now - Number(this.meta("klinesFilled") ?? 0) < HOUR) return;
    const end = Math.floor(now / MINUTE) * MINUTE - 2 * MINUTE;
    try {
      for (let start = end - 2 * DAY; start < end; start += 1000 * MINUTE) {
        const stop = Math.min(end, start + 999 * MINUTE);
        const list = parseBingxKlines(await this.get(`/openApi/swap/v3/quote/klines?symbol=${this.m.bingx}&interval=1m&startTime=${start}&endTime=${stop}&limit=1000`));
        for (const [t, o, h, l, c] of list) this.sql.exec("INSERT OR IGNORE INTO bars (t, src, row) VALUES (?, 'kline', ?)", t, JSON.stringify([t, o, h, l, c, []]));
      }
      this.setMeta("klinesFilled", now);
    } catch (err) {
      this.note("errors", `bingx kline fill: ${err}`);
    }
  }

  // No archive to import.
  protected override async importArchive() {}
}
