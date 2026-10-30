// 全市場 collector (docs/ORDERFLOW-MULTI-EXCHANGE.md): it reads the four exchanges' collectors every
// alarm, stores their merged minutes (aggregate.ts) and runs the detectors on the merged market, so
// 全市場's events come from the whole market rather than from Binance alone, and can go to LINE later.
//
// - Every alarm: the last 10–15 minutes of each collector (/recent, from a 5-minute boundary so OI
//   readings line up), merged and written over its own minutes. New prints, liquidations and OI
//   readings feed the same watchers as one exchange's collector; 跨所同步大單 (cross.js) is found here.
// - Book events (walls, spoofing, icebergs) need one exchange's book: Binance's are copied.
// - History: the last 30 days, one day of all four per alarm; today and yesterday are merged again
//   every hour, so archive imports and backfills reach it.
import { CROSS_WINDOW_MS, EXCHANGE_NAMES, crossClusters } from "../../public/lab/orderflow/cross.js";
import { closedBarEvents } from "../../public/lab/orderflow/keylevels.js";
import { watchPrint } from "../../public/lab/orderflow/watch.js";
import { mergeParts, type Part } from "./aggregate";
import { BAR_COOLDOWN_MS, BAR_HISTORY_MS, BAR_SETTLE_MS, Collector, DAY, FIVE_MIN, HEALTH_DOWN_MS, MINUTE, type OrderflowEnv } from "./collector";
import { EXCHANGES, stubFor, type Exchange } from "./exchanges";

const HISTORY_DAYS = 30;
const HOUR = 3_600_000;
const FRESH_MS = 120_000; // prints and liquidations older than this are history, not news
const SEEN_MAX = 20_000;
const BOOK_KINDS = new Set(["wall", "wall_eaten", "wall_pulled", "spoof", "iceberg"]);

type Merged = ReturnType<typeof mergeParts>;

export class MarketCollector extends Collector {
  protected override source = "all";
  private seenPrints = new Set<string>();
  private seenLiqs = new Set<string>();
  private crossSent = new Set<number>();
  private lastBookEvent = 0;
  private lastTrades: Record<string, number> = {};
  private lastMergeWrites: number | null = null;

  constructor(ctx: DurableObjectState, env: OrderflowEnv) {
    super(ctx, env);
    this.lastBookEvent = Number(this.meta("lastBookEvent") ?? 0);
  }

  private async read(ex: Exchange, path: string): Promise<(Part & { status?: { lastTrade?: number }; events?: any[] }) | null> {
    const stub = stubFor(this.env, ex, this.m);
    if (!stub) return null;
    try {
      const res = await stub.fetch(`https://collector${path}`);
      return res.ok ? await res.json() : null;
    } catch (err) {
      this.note("errors", `market read ${ex}: ${err}`);
      return null;
    }
  }

  private async readAll(path: string) {
    const answers = await Promise.all(EXCHANGES.map(async (ex) => [ex, await this.read(ex, path)] as const));
    for (const [ex, part] of answers) if (part?.status?.lastTrade) this.lastTrades[ex] = Number(part.status.lastTrade);
    return Object.fromEntries(answers.filter(([, part]) => part)) as Partial<Record<Exchange, Part>>;
  }

  // Brings the stored minutes of [from, to) up to the merged answer: bars and prints that left it
  // go, liquidations and readings only add. Cloudflare bills every row written, and this runs every
  // alarm over minutes that have mostly not changed, so a row that already matches is left alone.
  private write(m: Merged, from: number, to: number) {
    let written = 0;
    const exec = (query: string, ...args: SqlStorageValue[]) => {
      written += this.sql.exec(query, ...args).rowsWritten;
    };

    const bars = new Map(this.rows("SELECT t, row FROM bars WHERE t >= ? AND t < ?", from, to).map((r) => [Number(r.t), String(r.row)]));
    for (const row of m.bars) {
      const text = JSON.stringify(row);
      if (bars.get(row[0]) !== text) exec("INSERT OR REPLACE INTO bars (t, src, row) VALUES (?, 'merged', ?)", row[0], text);
      bars.delete(row[0]);
    }
    for (const t of bars.keys()) exec("DELETE FROM bars WHERE t = ?", t);

    const printKey = (t: unknown, side: unknown, price: unknown, qty: unknown) => `${t}|${side}|${price}|${qty}`;
    const prints = new Map(this.rows("SELECT t, side, price, qty, ex FROM prints WHERE t >= ? AND t < ?", from, to).map((r) => [printKey(r.t, r.side, r.price, r.qty), r]));
    for (const [t, side, price, qty, ex] of m.prints as [number, string, number, number, string][]) {
      const key = printKey(t, side, price, qty);
      const stored = prints.get(key);
      if (!stored) exec("INSERT OR IGNORE INTO prints (t, side, price, qty, src, ex) VALUES (?, ?, ?, ?, 'merged', ?)", t, side, price, qty, ex);
      else if (stored.ex !== ex) exec("UPDATE prints SET ex = ? WHERE t = ? AND side = ? AND price = ? AND qty = ?", ex, t, side, price, qty);
      prints.delete(key);
    }
    for (const r of prints.values()) exec("DELETE FROM prints WHERE t = ? AND side = ? AND price = ? AND qty = ?", r.t, r.side, r.price, r.qty);

    for (const [t, side, price, qty, ex] of m.liquidations as [number, string, number, number, string][]) exec("INSERT OR IGNORE INTO liqs VALUES (?, ?, ?, ?, ?)", t, side, price, qty, ex);

    const heatCols = m.heat as [number, ...unknown[]][];
    if (heatCols.length) {
      const heat = new Map(this.rows("SELECT t, row FROM heat WHERE t >= ? AND t <= ?", heatCols[0][0], heatCols[heatCols.length - 1][0]).map((r) => [Number(r.t), String(r.row)]));
      for (const col of heatCols) {
        const text = JSON.stringify(col);
        if (heat.get(col[0]) !== text) exec("INSERT OR REPLACE INTO heat (t, row) VALUES (?, ?)", col[0], text);
      }
    }

    if (m.metrics.length) {
      const range = [m.metrics[0][0], m.metrics[m.metrics.length - 1][0]] as [number, number];
      const ois = new Map(this.rows("SELECT t, oi, oi_value, funding FROM oi WHERE t >= ? AND t <= ?", ...range).map((r) => [Number(r.t), r]));
      const ratios = new Map(this.rows("SELECT t, ratio, top_pos, top_acc FROM ratios WHERE t >= ? AND t <= ?", ...range).map((r) => [Number(r.t), r]));
      for (const [t, oi, value, topPos, topAcc, ratio, , funding] of m.metrics) {
        const o = ois.get(t as number);
        if (!o || o.oi !== oi || o.oi_value !== value || o.funding !== funding) exec("INSERT OR REPLACE INTO oi (t, oi, oi_value, taker, funding) VALUES (?, ?, ?, NULL, ?)", t, oi, value, funding);
        const r = ratios.get(t as number);
        if (!r || r.ratio !== ratio || r.top_pos !== topPos || r.top_acc !== topAcc) exec("INSERT OR REPLACE INTO ratios (t, ratio, top_pos, top_acc) VALUES (?, ?, ?, ?)", t, ratio, topPos, topAcc);
      }
    }

    this.lastMergeWrites = written;
    const last = m.bars.at(-1);
    if (last) (this.lastPrice = last[4]), (this.lastTradeT = Math.max(this.lastTradeT, ...Object.values(this.lastTrades)));
  }

  private remember(set: Set<string>, key: string) {
    if (set.has(key)) return false;
    set.add(key);
    if (set.size > SEEN_MAX) set.delete(set.values().next().value!);
    return true;
  }

  // The newest minutes of all four, merged; new prints, liquidations, OI readings and cross-exchange
  // clusters go to the watchers.
  private async pullRecent(now: number) {
    const from = Math.floor(now / FIVE_MIN) * FIVE_MIN - 10 * MINUTE;
    const parts = await this.readAll(`/recent?since=${from}`);
    if (!parts.binance && !parts.bybit) return;
    const m = mergeParts(parts, from);
    const known = new Set(this.rows("SELECT t FROM oi WHERE t >= ?", from).map((r) => Number(r.t)));
    this.write(m, from, now + MINUTE);
    const fresh = now - FRESH_MS;
    for (const p of m.prints as [number, string, number, number, string][]) {
      if (!this.remember(this.seenPrints, p.join("|")) || p[0] < fresh) continue;
      this.alert(watchPrint(p, this.alertConfig));
    }
    for (const r of m.liquidations as [number, string, number, number, string][]) {
      if (!this.remember(this.seenLiqs, r.join("|")) || r[0] < fresh) continue;
      this.alert(this.liqWatch.add(r));
    }
    for (const [t, oi] of m.metrics) if (!known.has(t as number) && oi != null && (t as number) > now - 2 * FIVE_MIN) this.alert(this.oiWatch.add(t as number, oi, this.lastPrice));
    for (const c of crossClusters(m.prints, { min: this.alertConfig.crossBtc })) {
      if (c.t < fresh || this.crossSent.has(c.t)) continue;
      this.crossSent.add(c.t);
      if (this.crossSent.size > 1000) this.crossSent.delete(this.crossSent.values().next().value!);
      const names = c.exchanges.map(([ex]: [string]) => EXCHANGE_NAMES[ex as Exchange] ?? ex).join("、");
      this.alert({ kind: "cross", t: c.t, side: c.side, price: c.price, qty: c.qty, names, windowMs: CROSS_WINDOW_MS });
    }
  }

  // Binance's book events (walls, spoofing, icebergs), already placed at a key level by its collector.
  private async copyBookEvents(now: number) {
    const since = Math.floor(Math.max(this.lastBookEvent + 1, now - HOUR) / MINUTE) * MINUTE;
    const answer = await this.read("binance", `/events?since=${since}`);
    const before = this.lastBookEvent;
    for (const e of answer?.events ?? []) {
      if (!BOOK_KINDS.has(e.kind) || e.t <= this.lastBookEvent) continue;
      this.sql.exec(
        "INSERT INTO alerts (t, kind, text, state, level, dist, price, side, near, repeat, fanout) VALUES (?, ?, ?, 'logged', ?, ?, ?, ?, 1, ?, 1)",
        e.t,
        e.kind,
        e.text,
        e.level ?? null,
        e.dist ?? null,
        e.price ?? null,
        e.side ?? null,
        Number(Boolean(e.repeat)),
      );
      this.lastBookEvent = Math.max(this.lastBookEvent, e.t);
    }
    if (this.lastBookEvent !== before) this.setMeta("lastBookEvent", this.lastBookEvent);
  }

  // One day of history per alarm: yesterday and today once an hour (yesterday first, for the key
  // levels), then the rest of the 30 days not merged yet, newest first.
  private async mergeHistory(now: number) {
    const today = Math.floor(now / DAY) * DAY;
    const done = new Set(JSON.parse(this.meta("mergedDays") ?? "[]") as number[]);
    let day = [today - DAY, today].find((d) => now - Number(this.meta(`merged:${d}`) ?? 0) > HOUR) ?? null;
    if (day == null) for (let d = today - 2 * DAY; d > today - HISTORY_DAYS * DAY && day == null; d -= DAY) if (!done.has(d)) day = d;
    if (day == null) return;
    const d = new Date(day).toISOString().slice(0, 10);
    const parts = await this.readAll(`/day?d=${d}`);
    if (!parts.binance && !parts.bybit) return;
    // Today's newest minutes belong to pullRecent; stop short of them.
    const to = Math.min(day + DAY, Math.floor(now / FIVE_MIN) * FIVE_MIN - 10 * MINUTE);
    const m = mergeParts(parts, day);
    this.write({ ...m, bars: m.bars.filter((b) => b[0] < to), prints: m.prints.filter((p) => (p[0] as number) < to) }, day, to);
    this.levelsStale = true;
    this.setMeta(`merged:${day}`, now);
    done.add(day);
    this.setMeta("mergedDays", JSON.stringify([...done].filter((x) => x > today - HISTORY_DAYS * DAY)));
  }

  // Once, after yesterday and today are merged: the last day's events found on the merged market
  // (bar events, large prints, 跨所同步大單, liquidation bursts), so the narration does not start
  // empty. They are only recorded, like every event here.
  private replayDay(now: number) {
    if (this.meta("replayed") || !this.meta(`merged:${Math.floor(now / DAY) * DAY - DAY}`)) return;
    const from = now - DAY;
    this.updateLevels();
    const rows = this.rows("SELECT t, row FROM bars WHERE t >= ? AND t < ? ORDER BY t", from - BAR_HISTORY_MS, now).map((r) => JSON.parse(String(r.row)));
    const last = Math.floor((now - BAR_SETTLE_MS) / FIVE_MIN) * FIVE_MIN;
    let lo = 0;
    for (let end = Math.ceil(from / FIVE_MIN) * FIVE_MIN; end <= last; end += FIVE_MIN) {
      while (lo < rows.length && rows[lo][0] < end - BAR_HISTORY_MS) lo++;
      let hi = lo;
      while (hi < rows.length && rows[hi][0] < end) hi++;
      for (const e of closedBarEvents(rows.slice(lo, hi), this.m.tick, this.levelBook.levels(end), end)) {
        const key = `${e.kind}:${e.side}`;
        if (end - (this.barSent.get(key) ?? -Infinity) < BAR_COOLDOWN_MS) continue;
        this.barSent.set(key, end);
        this.alert(e);
      }
    }
    this.setMeta("barsDetected", last);
    const prints = this.rows("SELECT t, side, price, qty, ex FROM prints WHERE t >= ? ORDER BY t", from).map((r) => [r.t, r.side, r.price, r.qty, r.ex] as [number, string, number, number, string]);
    for (const p of prints) {
      this.remember(this.seenPrints, p.join("|"));
      this.alert(watchPrint(p, this.alertConfig));
    }
    for (const c of crossClusters(prints, { min: this.alertConfig.crossBtc })) {
      this.crossSent.add(c.t);
      const names = c.exchanges.map(([ex]: [string]) => EXCHANGE_NAMES[ex as Exchange] ?? ex).join("、");
      this.alert({ kind: "cross", t: c.t, side: c.side, price: c.price, qty: c.qty, names, windowMs: CROSS_WINDOW_MS });
    }
    for (const r of this.rows("SELECT t, side, price, qty, ex FROM liqs WHERE t >= ? ORDER BY t", from)) {
      const row = [r.t, r.side, r.price, r.qty, r.ex] as [number, string, number, number, string];
      this.remember(this.seenLiqs, row.join("|"));
      this.alert(this.liqWatch.add(row));
    }
    this.setMeta("replayed", now);
  }

  protected override async ensureStreams() {
    const now = Date.now();
    try {
      // History first: the key levels judging new events come from yesterday's merged minutes.
      await this.mergeHistory(now);
      this.replayDay(now);
      await this.pullRecent(now);
      await this.copyBookEvents(now);
    } catch (err) {
      this.note("errors", `market merge: ${err}`);
    }
  }

  // It only reads the other collectors, never an exchange, so it runs with the exchanges' streams off too.
  protected override streamsOn() {
    return true;
  }

  // Readings, klines and archives all arrive through the exchanges' collectors.
  protected override async pollRest() {}
  protected override async fillKlines() {}
  protected override async importArchive() {}
  protected override healthFeeds(): [keyof typeof HEALTH_DOWN_MS, boolean, number][] {
    return [];
  }

  protected override liveStatus() {
    return { lastTrade: this.lastTradeT, exchanges: this.lastTrades };
  }

  override publicStatus() {
    const { bybit, okx, open, bookReady, ...rest } = super.publicStatus();
    return { ...rest, exchanges: this.lastTrades, mergedDays: (JSON.parse(this.meta("mergedDays") ?? "[]") as number[]).length, lastMergeWrites: this.lastMergeWrites };
  }

  override async fetch(request: Request): Promise<Response> {
    // POST /archive (the admin token at the Worker): merge today and yesterday again now. With
    // ?days=all every day again, for history imported after this collector first merged it (a
    // new market's collector starts before its backfill lands and merges empty days).
    const url = new URL(request.url);
    if (url.pathname === "/archive" && request.method === "POST") {
      const today = Math.floor(Date.now() / DAY) * DAY;
      const all = url.searchParams.get("days") === "all";
      this.sql.exec("DELETE FROM meta WHERE k IN (?, ?)", `merged:${today}`, `merged:${today - DAY}`);
      if (all) this.sql.exec("DELETE FROM meta WHERE k = 'mergedDays'");
      await this.wake();
      const days = all ? Array.from({ length: HISTORY_DAYS }, (_, k) => today - k * DAY).reverse() : [today - DAY, today];
      return Response.json({ remerge: days.map((t) => new Date(t).toISOString().slice(0, 10)) });
    }
    return super.fetch(request);
  }
}
