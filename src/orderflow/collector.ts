// Order-flow collector: one Durable Object per market (BTCUSDT, ETHUSDT; markets.js) holding Bybit's
// streams (trades, 1,000-level book, tickers, liquidations) plus OKX liquidations, writing footprint bars, large prints,
// heatmap columns, OI and funding readings and liquidations to its SQLite storage. Binance refuses Cloudflare, see
// docs/ORDERFLOW-CF-PROBE.md, which also explains the 10 s alarm: open outbound sockets alone
// keep an object alive for at most 15 minutes.
import { DurableObject } from "cloudflare:workers";
import { LEVEL_LABELS, LevelBook, closedBarEvents, eventPrice, levelText, sessionOf, sessionStart } from "../../public/lab/orderflow/keylevels.js";
import { liqFeeds } from "../../public/lab/orderflow/liquidations.js";
import { DEFAULT_MARKET, MARKETS, marketOf, sized } from "../../public/lab/orderflow/markets.js";
import { ALERT_DEFAULTS, BAR_KINDS, alertDefaults, HEALTH_KINDS, IcebergWatch, healthStep, LiqWatch, OiWatch, SpoofWatch, WallWatch, describe, validSetting, watchPrint } from "../../public/lab/orderflow/watch.js";
import {
  ArchiveDay,
  BOOK_CHUNK_MS,
  BOOK_STEP_MS,
  OrderBook,
  PING,
  PRINT_MIN,
  REST_URL,
  WS_URL,
  addTrade,
  applyTicker,
  archiveUrl,
  bybitGet,
  bybitRefused,
  bybitTopics,
  parseArchiveLine,
  barRow,
  groupPrints,
  parseRestTrades,
  parseTrades,
  takerTotals,
} from "../../public/lab/orderflow/bybit.js";

export interface OrderflowEnv {
  COLLECTOR: DurableObjectNamespace<Collector>;
  // Binance's collector (src/orderflow/binance-collector.ts), fed by the Tokyo relay.
  BINANCE?: DurableObjectNamespace<Collector>;
  // OKX and BingX, reached directly (src/orderflow/okx-collector.ts, bingx-collector.ts).
  OKX?: DurableObjectNamespace<Collector>;
  BINGX?: DurableObjectNamespace<Collector>;
  // 全市場: the four merged, with events on the whole market (src/orderflow/market-collector.ts).
  MARKET?: DurableObjectNamespace<Collector>;
  ORDERFLOW_RELAY_TOKEN?: string;
  ORDERFLOW_ADMIN_TOKEN?: string;
  ORDERFLOW_STREAMS?: string; // "off" keeps the object from connecting (tests)
  // Alerts go to the admin's LINE through the CRM backend, which holds the LINE token:
  // "live" sends, "log" only records them (the default, also for local dev).
  ORDERFLOW_ALERTS?: string;
  ORDERFLOW_ALERT_TOKEN?: string;
  // Which collector's market events go to LINE: bybit (the default), binance, okx, bingx or all (全市場).
  ORDERFLOW_LINE_SOURCE?: string;
  BACKEND?: Fetcher;
}

// Alert delivery: queued events are merged into one LINE message at most once a minute, at most
// the configured dailyCap messages per Taipei day, so a busy market cannot use up the account's quota.
const ALERT_EVERY_MS = 60_000;
const ALERT_LINES = 8;
const ALERT_FRESH_MS = 120_000; // trades and liquidations replayed after a reconnect are not news
const FANOUT_FRESH_MS = 5 * 60_000; // members only get events from the last few minutes
// Collector health: a feed silent this long is reported once, and again when it recovers.
export const HEALTH_DOWN_MS = { Bybit: 120_000, OKX: 300_000, Binance: 120_000, BingX: 120_000 };
const HEALTH_ERRORS = 10; // errors within 10 minutes
const HEALTH_REPEAT_MS = 3_600_000;
// Bybit refuses Cloudflare's shared IPs for a while when they ask too often ("try again in 5
// minutes"); asking again every alarm only keeps the refusal going.
const REST_BACKOFF_MS = 5 * 60_000;
// Bar detectors run once a 5-minute bar has settled (late trades in), over enough history for their
// z-scores and swing levels, at most once per kind and direction in half an hour like detect().
export const BAR_SETTLE_MS = 15_000;
export const BAR_HISTORY_MS = 6 * 3_600_000;
export const BAR_COOLDOWN_MS = 30 * 60_000;
// Public events (GET /events): the newest at-level market events, at most this many per request.
const EVENTS_MAX = 2_000;
type AlertConfig = typeof ALERT_DEFAULTS;
export type AlertEvent = { kind: string; t: number; [k: string]: unknown };

export const MINUTE = 60_000;
export const FIVE_MIN = 5 * MINUTE;
export const DAY = 86_400_000;
const ALARM_MS = 10_000;
export const SILENT_MS = 30_000;
const SEEN_TRADES = 5_000; // trade ids kept to drop duplicates between the stream and a REST backfill
// Order flow is read over hours to days, so storage stays small: a month of footprints, prints,
// readings and liquidations, and a week of heatmap columns (the largest rows, ~3 KB a minute).
export const KEEP_MS = { bars: 30 * DAY, prints: 30 * DAY, heat: 30 * DAY, book: 30 * DAY, readings: 30 * DAY, liqs: 30 * DAY, alerts: 30 * DAY };
export const BACKFILL_DAYS = 15; // OI, long/short ratio and funding history fetched from REST
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
export type Trade = { id: string; t: number; price: number; qty: number; sell: boolean };
export type Row = Record<string, SqlStorageValue>;
// An archive day being streamed. Minutes before `cursor` are written; `open` is the minute
// still being built. The reader stays open across alarms.
type ArchiveJob = { day: string; from: number; cursor: number; open: number; reader: ReadableStreamDefaultReader<string>; build: ArchiveDay; carry: string };

const iso = (t: number) => new Date(t).toISOString();

// The one file in a zip archive, inflated as a stream. Sizes come from the central directory, since
// entries may carry a data descriptor with zero sizes in their local header.
function zipEntry(buf: ArrayBuffer): ReadableStream<Uint8Array> {
  const v = new DataView(buf);
  let eocd = buf.byteLength - 22;
  while (eocd >= 0 && v.getUint32(eocd, true) !== 0x06054b50) eocd--;
  if (eocd < 0) throw new Error("not a zip archive");
  const cd = v.getUint32(eocd + 16, true);
  const method = v.getUint16(cd + 10, true);
  const size = v.getUint32(cd + 20, true);
  const local = v.getUint32(cd + 42, true);
  const start = local + 30 + v.getUint16(local + 26, true) + v.getUint16(local + 28, true);
  const data = new Blob([new Uint8Array(buf, start, size)]).stream();
  return method === 0 ? data : data.pipeThrough(new DecompressionStream("deflate-raw"));
}
// A stalled archive download must not hold up the alarm that also persists the live minutes.
const within = <T>(p: Promise<T>, ms: number, what: string) =>
  new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${what} timed out`)), ms);
    p.then(resolve, reject).finally(() => clearTimeout(timer));
  });

export class Collector extends DurableObject<OrderflowEnv> {
  protected sql: SqlStorage;
  protected bars = new Map<number, Bar>(); // minutes not yet closed and persisted
  protected book = new OrderBook();
  protected ticker: { oi?: number; oiValue?: number; funding?: number; ts?: number } = {};
  private sockets = new Map<string, Socket>();
  protected seen = new Set<string>();
  private heat: [number, number, number, number[]] | null = null; // latest column of the current minute
  protected lastTradeT = 0;
  protected lastPrice = 0;
  protected alertConfig: AlertConfig = { ...ALERT_DEFAULTS };
  protected liqWatch = new LiqWatch(this.alertConfig);
  protected oiWatch = new OiWatch(this.alertConfig);
  protected wallWatch = new WallWatch(this.alertConfig);
  private iceWatch = new IcebergWatch(this.alertConfig);
  protected spoofWatch = new SpoofWatch(this.alertConfig);
  // Key levels of the previous and current UTC day, from closed persisted minutes; rebuilt
  // from storage after a restart or an archive import (which can correct the previous day).
  protected levelBook = new LevelBook(DEFAULT_MARKET.tick); // replaced for the object's market in the constructor
  protected levelsStale = true;
  private levelsUntil = 0; // minutes before this have been fed to the book
  private levelSent = new Map<string, number>(); // kind|level|side → time last let through
  protected barSent = new Map<string, number>(); // bar kind:dir → close of the bar last reported
  private archive: ArchiveJob | null = null;
  protected status = { boot: Date.now(), bybit: "idle", okx: "idle", gaps: [] as string[], errors: [] as string[], archive: null as Record<string, unknown> | null };
  protected source = "bybit";
  // The market this object collects, from the name it was opened with ("ETHUSDT"), kept in meta for
  // calls that arrive without one. Objects from before ETH are BTC.
  protected m = DEFAULT_MARKET;
  protected topics = bybitTopics(DEFAULT_MARKET.symbol);
  protected liqFeed(ex: string) {
    return liqFeeds(this.m).find((f) => f.ex === ex)!;
  }
  // Daily trade archive: where a day's file is and how its lines read. Bybit's is a gzipped CSV per
  // UTC day; Binance and OKX publish zips, OKX by Beijing day (archiveOffset −8 h).
  protected archiveName = "Bybit";
  protected archiveOffset = 0;
  protected archiveLateMs = ARCHIVE_LATE;
  protected archiveSource(day: string): { url: string; zip: boolean } {
    return { url: archiveUrl(day, undefined, this.m.symbol), zip: false };
  }
  protected archiveTrade(line: string): { t: number; price: number; qty: number; sell: boolean } | null {
    return parseArchiveLine(line);
  }
  // Market events go out to LINE (the admin and members) from the one collector ORDERFLOW_LINE_SOURCE
  // names; the others only record theirs. Collector health is sent either way.
  protected get marketLive() {
    return (this.env.ORDERFLOW_LINE_SOURCE ?? "bybit") === this.source;
  }

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
    // Added later: live prints (grouped by Bybit's seq, exact) are kept over the archive's
    // timestamp-grouped estimates; rows from before this column are archive prints.
    if (!this.rows("PRAGMA table_info(prints)").some((c) => c.name === "src")) this.sql.exec("ALTER TABLE prints ADD COLUMN src TEXT NOT NULL DEFAULT 'archive'");
    // Added after the first deploy: the funding rate held at each OI reading.
    if (!this.rows("PRAGMA table_info(oi)").some((c) => c.name === "funding")) this.sql.exec("ALTER TABLE oi ADD COLUMN funding REAL");
    // Added with the key-level filter: the nearest level when the event happened.
    if (!this.rows("PRAGMA table_info(alerts)").some((c) => c.name === "level")) this.sql.exec("ALTER TABLE alerts ADD COLUMN level TEXT; ALTER TABLE alerts ADD COLUMN dist REAL");
    // Added for the public events feed: where the event happened, its side and whether it was at a level.
    if (!this.rows("PRAGMA table_info(alerts)").some((c) => c.name === "near"))
      this.sql.exec("ALTER TABLE alerts ADD COLUMN price REAL; ALTER TABLE alerts ADD COLUMN side TEXT; ALTER TABLE alerts ADD COLUMN near INTEGER");
    // Added for members' LINE alerts: repeats at the same level, and whether an event still has to
    // be forwarded. Rows from before count as forwarded, so a deploy never sends old events.
    if (!this.rows("PRAGMA table_info(alerts)").some((c) => c.name === "fanout"))
      this.sql.exec("ALTER TABLE alerts ADD COLUMN repeat INTEGER NOT NULL DEFAULT 0; ALTER TABLE alerts ADD COLUMN fanout INTEGER NOT NULL DEFAULT 1");
    // Added with 全市場: which exchange a merged print came from (null in one exchange's collector).
    if (!this.rows("PRAGMA table_info(prints)").some((c) => c.name === "ex")) this.sql.exec("ALTER TABLE prints ADD COLUMN ex TEXT");
    // Added with Binance: top-trader position and account ratios (Bybit has none, so they stay null).
    if (!this.rows("PRAGMA table_info(ratios)").some((c) => c.name === "top_pos")) this.sql.exec("ALTER TABLE ratios ADD COLUMN top_pos REAL; ALTER TABLE ratios ADD COLUMN top_acc REAL");
    const named = Object.values(MARKETS).find((m) => m.symbol === ctx.id.name);
    const stored = this.meta("market");
    this.m = named ?? marketOf(stored ?? "btc");
    if (named && stored !== named.id) this.setMeta("market", named.id);
    this.topics = bybitTopics(this.m.symbol);
    this.levelBook = new LevelBook(this.m.tick);
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

  protected rows(query: string, ...args: SqlStorageValue[]): Row[] {
    return [...this.sql.exec(query, ...args)] as Row[];
  }

  protected meta(k: string): string | null {
    const [r] = this.rows("SELECT v FROM meta WHERE k = ?", k);
    return r ? String(r.v) : null;
  }

  protected setMeta(k: string, v: string | number) {
    this.sql.exec("INSERT INTO meta (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v", k, String(v));
  }

  protected note(kind: "gaps" | "errors", text: string) {
    const list = this.status[kind];
    list.unshift(`${iso(Date.now()).slice(0, 19)} ${text}`);
    list.length = Math.min(list.length, 20);
    if (kind === "errors") console.error(JSON.stringify({ event: "orderflow_collector_error", detail: text }));
  }

  // ---------- streams ----------

  protected streamsOn() {
    return this.env.ORDERFLOW_STREAMS !== "off";
  }

  private async openStream(name: "bybit" | "okx") {
    const url = name === "bybit" ? WS_URL : this.liqFeed("okx").url;
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
      ws.send(JSON.stringify({ op: "subscribe", args: [this.topics.trade, this.topics.book, this.topics.ticker, this.topics.liq] }));
      sock.ping = setInterval(() => ws.send(PING), 20_000);
    } else {
      const okx = this.liqFeed("okx");
      ws.send(JSON.stringify(okx.subscribe));
      sock.ping = setInterval(() => ws.send(okx.ping!), 20_000);
    }
    ws.addEventListener("message", (e) => {
      if (this.sockets.get(name) !== sock) return;
      sock.last = Date.now();
      const text = typeof e.data === "string" ? e.data : new TextDecoder().decode(e.data);
      if (text === "pong") return;
      try {
        if (name === "bybit") this.onBybit(JSON.parse(text));
        else this.saveLiqs(this.liqFeed("okx").parse(JSON.parse(text)));
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

  protected async ensureStreams() {
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
    if (m.topic === this.topics.trade) this.addTrades(parseTrades(m));
    else if (m.topic === this.topics.book) this.onBook(m);
    else if (m.topic === this.topics.ticker) this.onTicker(m);
    else if (m.topic === this.topics.liq) this.saveLiqs(this.liqFeed("bybit").parse(m));
  }

  // Book updates feed the spoofing watcher as they arrive; a vanished wall it reports is not
  // reported again as pulled by the 10 s wall checks.
  protected onBook(m: any) {
    const changes = this.book.apply(m);
    if (changes === "snapshot") return this.spoofWatch.reset(Number(m.ts) || Date.now(), this.book.bids, this.book.asks);
    if (changes?.length) this.watchChanges(Number(m.ts) || Date.now(), changes);
  }

  // Changed book levels [side, price, before, after] feed the spoofing watcher.
  protected watchChanges(t: number, changes: unknown[]) {
    const top = this.book.best();
    if (!top) return;
    for (const e of this.spoofWatch.update(t, changes, top)) {
      this.alert(e);
      this.wallWatch.forget(e.side as string, e.price as number);
    }
  }

  protected addTrades(trades: Trade[]) {
    const fresh: Trade[] = [];
    for (const tr of trades) {
      if (this.seen.has(tr.id)) continue;
      this.seen.add(tr.id);
      if (this.seen.size > SEEN_TRADES) this.seen.delete(this.seen.values().next().value!);
      addTrade(this.bars, tr, this.m.tick);
      if (tr.t > this.lastTradeT) (this.lastTradeT = tr.t), (this.lastPrice = tr.price);
      fresh.push(tr);
      this.wallWatch.trade(tr.price);
      this.spoofWatch.trade(tr.t, tr.price, tr.qty);
      // The book has not seen this fill yet, so it shows the size the trade met.
      this.iceWatch.trade(tr.t, tr.price, tr.qty, tr.sell, (tr.sell ? this.book.bids : this.book.asks).get(tr.price) ?? 0);
    }
    const now = Date.now();
    for (const print of groupPrints(fresh)) {
      const [t, side, price, qty] = print;
      if (qty < sized(this.m, PRINT_MIN)) continue;
      this.sql.exec("INSERT OR IGNORE INTO prints (t, side, price, qty, src) VALUES (?, ?, ?, ?, 'live')", t, side, price, qty);
      if (t > now - ALERT_FRESH_MS) this.alert(watchPrint(print, this.alertConfig));
    }
  }

  // Trades missed while the socket was down: Bybit serves the latest 1,000 (about one to two
  // minutes of BTC), so longer outages leave a gap, recorded in the status.
  private async backfillTrades() {
    if (!this.lastTradeT) return;
    try {
      const list: Trade[] = parseRestTrades((await bybitGet(`${REST_URL}/v5/market/recent-trade?category=linear&symbol=${this.m.symbol}&limit=1000`)).list);
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
    this.reading(ts);
    applyTicker(this.ticker, m);
    this.ticker.ts = ts;
  }

  // Called with each new reading's time before the reading is applied, so a boundary just crossed
  // records the values held up to it.
  protected reading(ts: number) {
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
  }

  protected saveLiqs(rows: [number, string, number, number, string][]) {
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
    Object.assign(this.alertConfig, alertDefaults(this.m));
    for (const [k, v] of Object.entries(saved)) if (validSetting(k, v)) (this.alertConfig as Record<string, number>)[k] = v as number;
  }

  // Every event is recorded; one whose kind is switched off is kept as "muted" instead of sent.
  // Market events also carry the nearest key level and whether they were within levelTolPct of it
  // (near, what the public feed shows). With levelOn, one away from every level is kept as
  // "offlevel", and a repeat at the same level within levelCooldownMs as "repeat".
  protected alert(e: AlertEvent | null) {
    if (!e) return;
    const market = !HEALTH_KINDS.has(e.kind) && e.kind !== "test";
    const on = HEALTH_KINDS.has(e.kind) ? this.alertConfig.healthOn : e.kind === "test" ? 1 : this.alertConfig.marketOn;
    let state = !on ? "muted" : market && !this.marketLive ? "logged" : "pending";
    let text = describe({ unit: this.m.base, bin: this.alertConfig.wallBin, ...e });
    let level: { name: string; price: number; dist: number } | null = null;
    let price: number | null = null;
    let near = false;
    let repeat = false;
    if (market) {
      this.updateLevels();
      price = eventPrice(e, this.lastPrice || null, this.alertConfig.wallBin);
      level = price ? this.levelBook.nearest(e.t, price) : null;
      near = Boolean(price && level && level.dist <= (price * this.alertConfig.levelTolPct) / 100);
      if (level) text += `｜${levelText(level)}`;
      // Repeats are judged whether or not levelOn holds back the admin's messages, since members'
      // alerts and the public feed skip them too.
      if (near && level) {
        const key = `${e.kind}|${level.name}|${e.side ?? ""}`;
        repeat = e.t - (this.levelSent.get(key) ?? -Infinity) < this.alertConfig.levelCooldownMs;
        if (!repeat) this.levelSent.set(key, e.t);
      }
      if (this.alertConfig.levelOn && state === "pending") state = !near ? "offlevel" : repeat ? "repeat" : state;
    }
    this.sql.exec(
      "INSERT INTO alerts (t, kind, text, state, level, dist, price, side, near, repeat, fanout) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      e.t,
      e.kind,
      text,
      state,
      level?.name ?? null,
      level ? Math.round(level.dist) : null,
      price == null ? null : Math.round(price * 10) / 10,
      typeof e.side === "string" ? e.side : null,
      market ? Number(near) : null,
      Number(repeat),
      Number(!(market && near && !repeat && this.marketLive)), // 0: still to forward to members (fanOut)
    );
  }

  // Closed 5-minute-bar detectors (signals.js) on the bar that just closed. Location is decided like
  // every other event, by the level book: the bar's key levels are the book's, so a sweep can also
  // be of VWAP or a stacked zone. After a restart or an outage only the latest bar is checked.
  private detectBars() {
    const end = Math.floor((Date.now() - BAR_SETTLE_MS) / FIVE_MIN) * FIVE_MIN;
    if (end <= Number(this.meta("barsDetected") ?? 0)) return;
    this.setMeta("barsDetected", end);
    const rows = this.rows("SELECT row FROM bars WHERE t >= ? AND t < ? ORDER BY t", end - BAR_HISTORY_MS, end).map((r) => JSON.parse(String(r.row)));
    this.updateLevels();
    for (const e of closedBarEvents(rows, this.m.tick, this.levelBook.levels(end), end)) {
      const key = `${e.kind}:${e.side}`;
      if (end - (this.barSent.get(key) ?? -Infinity) < BAR_COOLDOWN_MS) continue;
      this.barSent.set(key, end);
      this.alert(e);
    }
  }

  // The newest at-level market events since a time, oldest first, for the lab chart and browser
  // notifications. Delivery states stay internal; only a repeat at the same level is flagged.
  private events(since: number) {
    const rows = this.rows("SELECT t, kind, price, side, level, dist, state, repeat, text FROM alerts WHERE t >= ? AND near = 1 ORDER BY t DESC, id DESC LIMIT ?", since, EVENTS_MAX);
    return rows.reverse().map((r) => ({ t: r.t, kind: r.kind, price: r.price, side: r.side, level: r.level, dist: r.dist, repeat: r.repeat === 1 || r.state === "repeat", text: r.text }));
  }

  // Feeds closed minutes to the level book: the previous and current UTC day after a restart or
  // an archive import, then only the minutes closed since. Cheap when nothing new has closed.
  protected updateLevels() {
    const current = Math.floor(Date.now() / MINUTE) * MINUTE;
    let from = this.levelsUntil;
    if (this.levelsStale) {
      this.levelBook.reset();
      this.levelsStale = false;
      from = sessionStart(sessionOf(current) - 1);
    } else if (from >= current) return;
    for (const r of this.rows("SELECT row FROM bars WHERE t >= ? AND t < ? ORDER BY t", from, current)) this.levelBook.addMinute(JSON.parse(String(r.row)));
    this.levelsUntil = current;
  }

  protected levelsView(now: number) {
    this.updateLevels();
    return this.levelBook.levels(now).map((L) => ({ ...L, price: Math.round(L.price), label: LEVEL_LABELS[L.name as keyof typeof LEVEL_LABELS] }));
  }

  // ---------- collector health ----------

  // Each feed: [name, up, last trade]. BTC trades every second, so a quiet minute or two means the stream is down.
  protected healthFeeds(now: number): [keyof typeof HEALTH_DOWN_MS, boolean, number][] {
    return [
      ["Bybit", this.sockets.has("bybit") && now - this.lastTradeT < HEALTH_DOWN_MS.Bybit, this.lastTradeT],
      ["OKX", this.sockets.has("okx"), 0],
    ];
  }

  protected checkHealth() {
    const now = Date.now();
    for (const [feed, up, lastTrade] of this.healthFeeds(now)) {
      const key = `health${feed}`;
      const state = { since: Number(this.meta(`${key}Since`) ?? 0), told: this.meta(`${key}Told`) === "1" ? 1 : 0, upAt: Number(this.meta(`${key}Up`) ?? 0) };
      const [next, event] = healthStep(state, { up, now, lastTrade, downMs: HEALTH_DOWN_MS[feed] });
      if (event) this.alert({ ...event, t: now, feed });
      if (!next.since) this.sql.exec("DELETE FROM meta WHERE k IN (?, ?, ?)", `${key}Since`, `${key}Told`, `${key}Up`);
      else {
        if (next.since !== state.since) this.setMeta(`${key}Since`, next.since);
        if (next.told && !state.told) this.setMeta(`${key}Told`, "1");
        if (next.upAt !== state.upAt) next.upAt ? this.setMeta(`${key}Up`, next.upAt) : this.sql.exec("DELETE FROM meta WHERE k = ?", `${key}Up`);
      }
    }
    // A day still missing after its retries, reported once per day.
    const archive = this.status.archive as { day?: string; state?: string } | null;
    const attempts = Number(this.meta("archiveAttempts") ?? 0);
    const late = archive?.state === "waiting" && archive.day && now > Date.parse(`${archive.day}T00:00:00Z`) + this.archiveOffset + DAY + this.archiveLateMs;
    if (archive?.day && (attempts >= 3 || late) && this.meta("healthArchiveTold") !== archive.day) {
      const reason = attempts >= 3 ? (this.status.errors.find((e) => e.includes("archive")) ?? "重試 3 次失敗").slice(20, 160) : `${this.archiveName} 還沒發布，或下載被擋`;
      this.alert({ kind: "health_archive", t: now, day: archive.day, reason });
      this.setMeta("healthArchiveTold", archive.day);
    }
    // Bursts of errors, at most hourly; delivery errors are left out so a LINE outage does not loop.
    const recent = this.status.errors.filter((e) => !e.includes("alert delivery") && Date.parse(`${e.slice(0, 19)}Z`) > now - 10 * MINUTE);
    if (recent.length >= HEALTH_ERRORS && now - Number(this.meta("healthErrorsTold") ?? 0) > HEALTH_REPEAT_MS) {
      this.alert({ kind: "health_errors", t: now, count: recent.length, last: recent[0].slice(20, 140) });
      this.setMeta("healthErrorsTold", now);
    }
  }

  // Walls and icebergs need the book after updates; checked every alarm.
  private watchBook() {
    if (!this.book.ready) return;
    const now = Date.now();
    for (const e of this.wallWatch.check(now, this.book.bids, this.book.asks)) this.alert(e);
    for (const e of this.iceWatch.check(now, this.book.bids, this.book.asks)) this.alert(e);
  }

  // Members' alerts: fresh at-level events go to the backend, which picks the subscribers who chose
  // each type (src/orderflow-subs.ts). Unlike the admin's merged message this is not held to the
  // admin's dailyCap; members have their own daily counts. A failed call is retried next alarm
  // while the events are still fresh.
  private async fanOut() {
    const rows = this.rows("SELECT id, t, kind, text FROM alerts WHERE fanout = 0 ORDER BY id LIMIT 50");
    if (!rows.length) return;
    const done = () => {
      for (const r of rows) this.sql.exec("UPDATE alerts SET fanout = 1 WHERE id = ?", r.id);
    };
    const fresh = rows.filter((r) => Number(r.t) > Date.now() - FANOUT_FRESH_MS);
    if (!fresh.length || (this.env.ORDERFLOW_ALERTS ?? "log") !== "live" || !this.env.BACKEND || !this.env.ORDERFLOW_ALERT_TOKEN) return done();
    const events = fresh.map((r) => {
      const t = Number(r.t);
      // Bar events carry the close of their bar; the link opens the bar's last minute.
      const at = Math.floor((BAR_KINDS.includes(String(r.kind)) ? t - 1 : t) / MINUTE) * MINUTE;
      return { key: `of-${this.m.id === "btc" ? "" : `${this.m.id}-`}${r.id}-${t}`, t, kind: r.kind, text: r.text, at, m: this.m.id };
    });
    try {
      const res = await this.env.BACKEND.fetch("https://backend/api/internal/orderflow-alert", {
        method: "POST",
        headers: { authorization: `Bearer ${this.env.ORDERFLOW_ALERT_TOKEN}`, "content-type": "application/json" },
        body: JSON.stringify({ events }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status} ${(await res.text()).slice(0, 120)}`);
      done();
    } catch (err) {
      this.note("errors", `alert delivery: members ${err}`);
    }
  }

  protected async flushAlerts() {
    await this.fanOut();
    const mode = this.env.ORDERFLOW_ALERTS ?? "log";
    let pending = this.rows("SELECT id, t, kind, text FROM alerts WHERE state = 'pending' ORDER BY id");
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
    const cap = this.alertConfig.dailyCap;
    if (sentToday >= cap) {
      // The cap protects the LINE quota from a busy market; collector health still goes out.
      mark(ids(pending.filter((r) => !HEALTH_KINDS.has(String(r.kind)))), "capped");
      pending = pending.filter((r) => HEALTH_KINDS.has(String(r.kind)));
      if (!pending.length) return;
    }
    const lines = pending.slice(0, ALERT_LINES).map((r) => String(r.text));
    if (pending.length > ALERT_LINES) lines.push(`…另有 ${pending.length - ALERT_LINES} 則`);
    const at = Math.floor(Number(pending[0].t) / MINUTE) * MINUTE;
    // Collector health has nothing to look at on the chart, and is not a market event.
    const healthOnly = pending.every((r) => HEALTH_KINDS.has(String(r.kind)));
    const text = [
      `MetaBear 訂單流通知（${this.m.base}）`,
      ...lines,
      healthOnly ? "" : `https://metabear.io/lab/orderflow/?tf=1&at=${at}&ex=${this.source}${this.m.id === "btc" ? "" : `&m=${this.m.id}`}`,
      sentToday + 1 === cap ? "今天的通知已達上限，之後的事件只記錄不推送。" : "",
      healthOnly ? "" : "盤面事件，不是買賣建議。",
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
      defaults: alertDefaults(this.m),
      sentToday: this.meta("alertDay") === day ? Number(this.meta("alertCount") ?? 0) : 0,
      dailyCap: this.alertConfig.dailyCap,
      levels: this.levelsView(Date.now()),
      recent: this.rows("SELECT id, t, kind, text, state, level, dist FROM alerts ORDER BY id DESC LIMIT 50").map((r) => ({ ...r, t: iso(Number(r.t)) })),
    };
  }

  // ---------- persistence ----------

  protected persistBars() {
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

  protected persistHeat() {
    const col = this.book.column(this.m.tick);
    if (!col) return;
    const now = Date.now();
    const minute = Math.floor(now / MINUTE) * MINUTE;
    // One coarse column per minute (the latest snapshot in it) for long views, and the whole book
    // at $1 every 10 s for detail. A fine row is about 2 KB, about 520 MB over 30 days.
    this.heat = [minute, ...col] as [number, number, number, number[]];
    this.sql.exec("INSERT INTO heat (t, row) VALUES (?, ?) ON CONFLICT(t) DO UPDATE SET row = excluded.row", minute, JSON.stringify(this.heat));
    const fine = this.book.span(this.m.bookTick);
    const slot = Math.floor(now / BOOK_STEP_MS) * BOOK_STEP_MS;
    if (fine) this.sql.exec("INSERT OR REPLACE INTO book (t, row) VALUES (?, ?)", slot, JSON.stringify([slot, ...fine]));
  }

  // OI and account long/short ratio history from REST, one page per alarm, then every 5 minutes
  // to fill readings the stream missed. Bybit's ratio is accounts long ÷ accounts short.
  protected async pollRest() {
    const now = Date.now();
    if (now < Number(this.meta("restRetryAt") ?? 0)) return;
    for (const [kind, pageMs] of [["oi", 200 * FIVE_MIN], ["ratio", 500 * FIVE_MIN], ["funding", 200 * 8 * 3_600_000]] as const) {
      const key = `${kind}Cursor`;
      let cursor = Number(this.meta(key) ?? 0) || now - BACKFILL_DAYS * DAY;
      const caughtUp = cursor > now - 15 * MINUTE;
      if (caughtUp && now - Number(this.meta(`${kind}Polled`) ?? 0) < FIVE_MIN) continue;
      if (caughtUp) cursor = now - 30 * MINUTE;
      const end = Math.min(now, cursor + pageMs);
      const url = {
        oi: `${REST_URL}/v5/market/open-interest?category=linear&symbol=${this.m.symbol}&intervalTime=5min&limit=200&startTime=${cursor}&endTime=${end}`,
        ratio: `${REST_URL}/v5/market/account-ratio?category=linear&symbol=${this.m.symbol}&period=5min&limit=500&startTime=${cursor}&endTime=${end}`,
        // Settled rates, every 8 hours.
        funding: `${REST_URL}/v5/market/funding/history?category=linear&symbol=${this.m.symbol}&limit=200&startTime=${cursor}&endTime=${end}`,
      }[kind];
      try {
        for (const r of (await bybitGet(url)).list) {
          if (kind === "oi") this.sql.exec("INSERT OR REPLACE INTO oi_rest (t, oi) VALUES (?, ?)", Number(r.timestamp), Number(r.openInterest));
          else if (kind === "funding") this.sql.exec("INSERT OR REPLACE INTO funding (t, rate) VALUES (?, ?)", Number(r.fundingRateTimestamp), Number(r.fundingRate));
          else this.sql.exec("INSERT OR REPLACE INTO ratios (t, ratio) VALUES (?, ?)", Number(r.timestamp), Math.round((Number(r.buyRatio) / Number(r.sellRatio)) * 1e4) / 1e4);
        }
        this.setMeta(key, Math.max(Number(this.meta(key) ?? 0), end - 10 * MINUTE));
        this.setMeta(`${kind}Polled`, now);
      } catch (err) {
        if (this.restRefused(err, `${kind} history`)) return;
        this.note("errors", `${kind} history: ${err}`);
      }
    }
  }

  // A refusal pauses all of this collector's Bybit REST calls, noted once per pause.
  protected restRefused(err: unknown, what: string) {
    if (!bybitRefused(err)) return false;
    this.setMeta("restRetryAt", Date.now() + REST_BACKOFF_MS);
    this.note("errors", `${what}: ${err}; Bybit REST paused 5 minutes`);
    return true;
  }

  // Minutes the collector never saw (before it started, or a long outage) get Bybit's 1-minute
  // klines: price only, no footprint or taker split, so the lab marks them partial. Live and
  // archive rows replace them.
  protected async fillKlines() {
    const now = Date.now();
    if (now - Number(this.meta("klinesFilled") ?? 0) < 3_600_000 || now < Number(this.meta("restRetryAt") ?? 0)) return;
    const end = Math.floor(now / MINUTE) * MINUTE - 2 * MINUTE;
    try {
      for (let start = end - 2 * DAY; start < end; start += 1000 * MINUTE) {
        const stop = Math.min(end, start + 999 * MINUTE);
        const result = await bybitGet(`${REST_URL}/v5/market/kline?category=linear&symbol=${this.m.symbol}&interval=1&limit=1000&start=${start}&end=${stop}`);
        for (const [t, o, h, l, c] of result.list as string[][])
          this.sql.exec("INSERT OR IGNORE INTO bars (t, src, row) VALUES (?, 'kline', ?)", Number(t), JSON.stringify([Number(t), Number(o), Number(h), Number(l), Number(c), []]));
      }
      this.setMeta("klinesFilled", now);
    } catch (err) {
      if (!this.restRefused(err, "kline fill")) this.note("errors", `kline fill: ${err}`);
    }
  }

  // ---------- daily trade archive ----------

  // Archive rows are authoritative over live and kline rows; prints in [from, to) are replaced.
  private writeArchive(rows: unknown[][], prints?: { from: number; to: number; list: [number, string, number, number][] }) {
    for (const row of rows) this.sql.exec("INSERT INTO bars (t, src, row) VALUES (?, 'archive', ?) ON CONFLICT(t) DO UPDATE SET src = 'archive', row = excluded.row", row[0] as number, JSON.stringify(row));
    if (!prints) return;
    // Archive prints replace earlier archive prints, but only fill minutes without live ones.
    this.sql.exec("DELETE FROM prints WHERE t >= ? AND t < ? AND src = 'archive'", prints.from, prints.to);
    const live = new Set(this.rows("SELECT DISTINCT (t / 60000) * 60000 AS m FROM prints WHERE t >= ? AND t < ? AND src = 'live'", prints.from, prints.to).map((r) => Number(r.m)));
    for (const [t, side, price, qty] of prints.list)
      if (t >= prints.from && t < prints.to && !live.has(Math.floor(t / MINUTE) * MINUTE))
        this.sql.exec("INSERT OR IGNORE INTO prints (t, side, price, qty, src) VALUES (?, ?, ?, ?, 'archive')", t, side, price, qty);
  }

  // The day to import next: the one after the last imported, at most ARCHIVE_CATCHUP days back,
  // and only once its file is due.
  private archiveDue(now: number) {
    const offset = this.archiveOffset;
    const latest = Math.floor((now - ARCHIVE_DUE - offset) / DAY) * DAY - DAY + offset;
    const done = this.meta("archiveDone");
    const next = Math.max(done ? Date.parse(`${done}T00:00:00Z`) + offset + DAY : latest, latest - (ARCHIVE_CATCHUP - 1) * DAY);
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
    const day = iso(from - this.archiveOffset).slice(0, 10);
    const source = this.archiveSource(day);
    // After a failure or a restart, minutes already written are skipped.
    const saved = JSON.parse(this.meta("archiveCursor") ?? "null") as { day: string; t: number } | null;
    const cursor = saved?.day === day ? saved.t : from;
    let res: Response;
    try {
      // Bybit's CloudFront refuses requests without a User-Agent (403), which Workers omit. The files
      // sit behind CDNs whose edges keep a 404 from before publication: OKX's 10/25 stayed "missing"
      // near the collector for hours while other edges served it. A query that changes every retry
      // reaches the origin, which ignores it.
      const url = `${source.url}${source.url.includes("?") ? "&" : "?"}try=${Math.floor(now / ARCHIVE_WAIT)}`;
      res = await within(fetch(url, { cache: "no-store", headers: { "user-agent": "metabear-orderflow (+https://metabear.io)" } }), 30_000, "fetch");
    } catch (err) {
      this.archiveFailed(day, `fetch: ${err}`);
      return null;
    }
    // Exchanges answer 404 until the file is published.
    if (res.status === 404) {
      await res.body?.cancel();
      this.archiveRetry(day, ARCHIVE_WAIT, "waiting", now > from + DAY + this.archiveLateMs ? `still missing (HTTP ${res.status})` : undefined);
      return null;
    }
    if (!res.ok || !res.body) {
      await res.body?.cancel();
      this.archiveFailed(day, `HTTP ${res.status}`);
      return null;
    }
    let body: ReadableStream<Uint8Array>;
    try {
      body = source.zip ? zipEntry(await within(res.arrayBuffer(), 60_000, "download")) : res.body.pipeThrough(new DecompressionStream("gzip"));
    } catch (err) {
      this.archiveFailed(day, `${err}`);
      return null;
    }
    const reader = body.pipeThrough(new TextDecoderStream()).getReader();
    this.status.archive = { day, state: "importing", from: iso(cursor) };
    return (this.archive = { day, from, cursor, open: cursor, reader, build: new ArchiveDay(this.m.tick, sized(this.m, PRINT_MIN)), carry: "" });
  }

  // Writes the finished minutes before `before` (all of them at the end of the file) and
  // replaces the prints from the cursor up to it.
  private flushArchive(job: ArchiveJob, before: number, end = false) {
    const { rows, prints } = job.build.take(end ? Infinity : before);
    this.writeArchive(rows, { from: job.cursor, to: before, list: prints });
    job.cursor = before;
  }

  private archiveLine(job: ArchiveJob, line: string) {
    const trade = this.archiveTrade(line); // null for the header
    if (!trade || trade.t < job.cursor || trade.t >= job.from + DAY) return;
    const minute = job.build.addTrade(trade);
    if (minute > job.open) {
      this.flushArchive(job, minute);
      job.open = minute;
    }
  }

  // One slice of the day per alarm; the file is streamed and never held whole.
  protected async importArchive() {
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
          this.levelsStale = true; // the archive may correct the previous day's levels
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
        this.updateLevels();
        this.detectBars();
        await this.pollRest();
        await this.fillKlines();
        this.watchBook();
        this.checkHealth();
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

  protected async wake() {
    if ((await this.ctx.storage.getAlarm()) == null) await this.ctx.storage.setAlarm(Date.now());
  }

  // ---------- queries ----------

  // Rows are stored as JSON text; responses are assembled from it without re-parsing.
  protected series(from: number, to: number) {
    const bars = new Map<number, string>(this.rows("SELECT t, row FROM bars WHERE t >= ? AND t < ? ORDER BY t", from, to).map((r) => [Number(r.t), String(r.row)]));
    for (const [t, bar] of this.bars) if (t >= from && t < to) bars.set(t, JSON.stringify(barRow(t, bar)));
    const heat = new Map<number, string>(this.rows("SELECT t, row FROM heat WHERE t >= ? AND t < ? ORDER BY t", from, to).map((r) => [Number(r.t), String(r.row)]));
    if (this.heat && this.heat[0] >= from && this.heat[0] < to) heat.set(this.heat[0], JSON.stringify(this.heat));
    return {
      bars: `[${[...bars.entries()].sort((a, b) => a[0] - b[0]).map((e) => e[1]).join(",")}]`,
      heat: `[${[...heat.entries()].sort((a, b) => a[0] - b[0]).map((e) => e[1]).join(",")}]`,
      metrics: JSON.stringify(this.metrics(from, to)),
      liquidations: JSON.stringify(this.rows("SELECT t, side, price, qty, ex FROM liqs WHERE t >= ? AND t < ? ORDER BY t", from, to).map((r) => [r.t, r.side, r.price, r.qty, r.ex])),
      prints: JSON.stringify(this.rows("SELECT t, side, price, qty, ex FROM prints WHERE t >= ? AND t < ? ORDER BY t", from, to).map((r) => (r.ex ? [r.t, r.side, r.price, r.qty, r.ex] : [r.t, r.side, r.price, r.qty]))),
    };
  }

  // Reading-time rows in the lab's shape: [t, OI (BTC), OI (USDT), top-trader position ratio,
  // top-trader account ratio, all-account ratio, taker buy/sell over [t − 5m, t), funding rate].
  // Bybit has no top-trader ratios (Binance does). Stream readings win; REST rows fill the rest (OI
  // valued at bar close, funding as the last settled rate).
  protected metrics(from: number, to: number) {
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
    const ratios = this.rows("SELECT t, ratio, top_pos, top_acc FROM ratios WHERE t >= ? AND t < ? ORDER BY t", from - DAY, to);
    const settled = this.rows("SELECT t, rate FROM funding WHERE t >= ? AND t < ? ORDER BY t", from - DAY, to);
    const rows = [...out.values()].sort((a, b) => (a[0] as number) - (b[0] as number));
    let k = -1;
    let f = -1;
    for (const row of rows) {
      while (k + 1 < ratios.length && Number(ratios[k + 1].t) <= (row[0] as number)) k++;
      while (f + 1 < settled.length && Number(settled[f + 1].t) <= (row[0] as number)) f++;
      row[3] = k >= 0 ? ((ratios[k].top_pos as number | null) ?? null) : null;
      row[4] = k >= 0 ? ((ratios[k].top_acc as number | null) ?? null) : null;
      row[5] = k >= 0 ? ((ratios[k].ratio as number | null) ?? null) : null;
      row[7] ??= f >= 0 ? (settled[f].rate as number) : null;
    }
    return rows;
  }

  protected respond(parts: Record<string, string>, extra: Record<string, unknown>) {
    const head = JSON.stringify({ symbol: this.m.symbol, tick: this.m.tick, source: this.source, ...extra }).slice(0, -1);
    const body = `${head},${Object.entries(parts).map(([k, v]) => `"${k}":${v}`).join(",")}}`;
    return new Response(body, { headers: { "content-type": "application/json; charset=utf-8" } });
  }

  protected liveStatus(): Record<string, unknown> {
    return { bybit: this.status.bybit, lastTrade: this.lastTradeT };
  }

  publicStatus(): Record<string, unknown> {
    return {
      ...this.status,
      boot: iso(this.status.boot),
      lastTrade: this.lastTradeT ? iso(this.lastTradeT) : null,
      bookReady: this.book.ready,
      open: [...this.sockets.keys()],
      oi: this.ticker.oi ?? null,
      levels: this.levelsView(Date.now()),
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
      return this.respond(this.series(since, now + MINUTE), { since, updated: now, status: this.liveStatus() });
    }
    if (url.pathname === "/events") {
      const since = Number(url.searchParams.get("since"));
      return Response.json({ since, updated: now, events: this.events(since) });
    }
    if (url.pathname === "/alerts") {
      if (request.method === "POST") {
        // { config: { printBtc: 80, … } } tunes thresholds (null restores the defaults);
        // { test: true } queues a test message.
        const body = (await request.json()) as { config?: Record<string, number> | null; test?: boolean };
        if (body.config === null) this.sql.exec("DELETE FROM meta WHERE k = 'alertConfig'");
        else if (body.config) {
          const next = { ...JSON.parse(this.meta("alertConfig") ?? "{}") };
          for (const [k, v] of Object.entries(body.config)) if (validSetting(k, v)) next[k] = v;
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
      return new Response(`{"from":${from},"step":${BOOK_STEP_MS},"tick":${this.m.bookTick},"columns":[${rows.map((r) => String(r.row)).join(",")}]}`, {
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
      this.levelsStale = true;
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
