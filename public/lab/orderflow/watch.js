// Order-flow watchers: large taker orders, liquidation cascades, OI surges, order-book walls,
// spoofing and icebergs. The collector (src/orderflow/collector.ts) feeds them live Bybit data and sends what
// they report to the admin's LINE; they describe what happened, never what to trade.
//
// Every watcher is plain state plus methods that take timestamps, so tests drive them with
// made-up streams and the collector with the live ones.

import { SIGNALS } from "./signals.js";

export const ALERT_DEFAULTS = {
  marketOn: 1, // 1 sends market alerts, 0 only records them
  healthOn: 1, // 1 sends collector health alerts, 0 only records them
  printBtc: 50, // one aggregated taker order
  liqUsd: 2_000_000, // liquidations on one side within liqWindowMs
  liqWindowMs: 60_000,
  oiZ: 3, // 5-minute OI change against the last day of changes
  oiMinPct: 0.4, // and at least this many percent
  wallBtc: 60, // resting size in one $10 band
  wallRatio: 4, // and this many times the median band of the book
  wallHoldMs: 60_000, // present this long before it counts
  wallBin: 10,
  icebergBtc: 25, // filled at one price
  icebergRatio: 3, // and this many times the most ever shown there
  // A live trial with 50 BTC, 3× and 3 s flagged about one a minute, mostly second- and third-level
  // quotes being moved, so a spoofed wall must be as large as a reported wall and stand 10 s.
  spoofBtc: 100, // size gone from one $10 band
  spoofRatio: 4, // the band held at least this many times the book's median band
  spoofWindowMs: 1_000, // within this long
  spoofHoldMs: 10_000, // after standing at least this long
  spoofNearPct: 0.1, // while price was this close to the band
  spoofTradeRatio: 0.2, // and trades in the band made up less than this share of it
  cooldownMs: 10 * 60_000, // per kind and side or price
  // Location filter (keylevels.js): market events away from every key level are recorded, not sent.
  levelOn: 1,
  levelTolPct: 0.1, // within this many percent of a level
  levelCooldownMs: 60 * 60_000, // one event per kind, level and side
  // LINE's free plan has 200 pushes a month for everything, so market alerts stay few.
  dailyCap: 3, // LINE messages of market alerts per Taipei day; health alerts are not capped
};

const median = (list) => {
  if (!list.length) return 0;
  const s = [...list].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
};

class Cooldown {
  constructor() {
    this.until = new Map();
  }
  ready(key, t, ms) {
    if ((this.until.get(key) ?? -Infinity) > t) return false;
    this.until.set(key, t + ms);
    return true;
  }
}

/** Large prints: [t, side, price, qty] from groupPrints. */
export function watchPrint(print, cfg = ALERT_DEFAULTS) {
  const [t, side, price, qty] = print;
  return qty >= cfg.printBtc ? { kind: "print", t, side, price, qty } : null;
}

/** Liquidations [t, "long" | "short", price, qty, exchange] summed per side over a rolling window. */
export class LiqWatch {
  constructor(cfg = ALERT_DEFAULTS) {
    this.cfg = cfg;
    this.recent = { long: [], short: [] };
    this.cool = new Cooldown();
  }

  add([t, side, price, qty, ex]) {
    const list = this.recent[side];
    if (!list) return null;
    list.push({ t, price, usd: price * qty, ex });
    while (list.length && list[0].t < t - this.cfg.liqWindowMs) list.shift();
    const usd = list.reduce((sum, r) => sum + r.usd, 0);
    if (usd < this.cfg.liqUsd || !this.cool.ready(side, t, this.cfg.cooldownMs)) return null;
    const prices = list.map((r) => r.price);
    return { kind: "liq", t, side, usd, count: list.length, low: Math.min(...prices), high: Math.max(...prices), exchanges: [...new Set(list.map((r) => r.ex))] };
  }
}

/** 5-minute OI readings: flags a change far outside the last day's, with the price move beside it. */
export class OiWatch {
  constructor(cfg = ALERT_DEFAULTS) {
    this.cfg = cfg;
    this.changes = []; // percent changes, newest last
    this.last = null; // { t, oi, price }
    this.cool = new Cooldown();
  }

  add(t, oi, price) {
    const prev = this.last;
    this.last = { t, oi, price };
    if (!prev || !(prev.oi > 0)) return null;
    const pct = ((oi - prev.oi) / prev.oi) * 100;
    const history = this.changes.slice(-288);
    this.changes.push(pct);
    if (this.changes.length > 600) this.changes.splice(0, this.changes.length - 288);
    if (history.length < 48) return null; // four hours before z-scores mean anything
    const mean = history.reduce((a, b) => a + b, 0) / history.length;
    const sd = Math.sqrt(history.reduce((a, b) => a + (b - mean) ** 2, 0) / history.length) || 1e-9;
    const z = (pct - mean) / sd;
    if (Math.abs(z) < this.cfg.oiZ || Math.abs(pct) < this.cfg.oiMinPct) return null;
    if (!this.cool.ready(pct > 0 ? "up" : "down", t, this.cfg.cooldownMs)) return null;
    const pricePct = prev.price > 0 && price > 0 ? ((price - prev.price) / prev.price) * 100 : 0;
    // Rising OI opens positions, falling OI closes them; the price move says which side drove it.
    const reading = pct > 0 ? (pricePct >= 0 ? "新多單進場" : "新空單進場") : pricePct >= 0 ? "空單回補" : "多單平倉";
    return { kind: "oi", t, pct, z, pricePct, reading };
  }
}

/**
 * Walls: a $10 band holding far more than the rest of the book, present for wallHoldMs. Once
 * reported, its disappearance is reported too: eaten if trades reached its band, pulled if not.
 */
export class WallWatch {
  constructor(cfg = ALERT_DEFAULTS) {
    this.cfg = cfg;
    this.walls = new Map(); // "bid|band" → { side, band, first, max, size, reported }
    this.low = Infinity; // trade range since the last check
    this.high = -Infinity;
    this.cool = new Cooldown();
  }

  trade(price) {
    if (price < this.low) this.low = price;
    if (price > this.high) this.high = price;
  }

  /** Stops following a band (reported elsewhere, e.g. as spoofing). */
  forget(side, band) {
    this.walls.delete(`${side}|${band}`);
  }

  /** bids and asks: Map(price → BTC); returns events. */
  check(t, bids, asks) {
    const { wallBin: bin, wallBtc, wallRatio, wallHoldMs, cooldownMs } = this.cfg;
    const bands = (side) => {
      const out = new Map();
      for (const [p, q] of side) {
        const band = Math.floor(p / bin) * bin;
        out.set(band, (out.get(band) ?? 0) + q);
      }
      return out;
    };
    const sides = { bid: bands(bids), ask: bands(asks) };
    const typical = median([...sides.bid.values(), ...sides.ask.values()]);
    const events = [];
    const seen = new Set();
    for (const side of ["bid", "ask"]) {
      for (const [band, size] of sides[side]) {
        if (size < wallBtc || size < wallRatio * typical) continue;
        const key = `${side}|${band}`;
        seen.add(key);
        let w = this.walls.get(key);
        if (!w) this.walls.set(key, (w = { side, band, first: t, max: size, size, reported: false, low: Infinity, high: -Infinity }));
        w.size = size;
        w.max = Math.max(w.max, size);
        if (!w.reported && t - w.first >= wallHoldMs && this.cool.ready(key, t, cooldownMs)) {
          w.reported = true;
          events.push({ kind: "wall", t, side, price: band, size, heldMs: t - w.first });
        }
      }
    }
    for (const [key, w] of this.walls) {
      // Trades since the wall appeared, to tell later whether price reached it.
      w.low = Math.min(w.low, this.low);
      w.high = Math.max(w.high, this.high);
      if (seen.has(key)) continue;
      const left = (w.side === "bid" ? sides.bid : sides.ask).get(w.band) ?? 0;
      // A wall that only shrank below the thresholds but still holds most of its size stays.
      if (left >= w.max * 0.3 && left >= wallBtc * 0.5) continue;
      this.walls.delete(key);
      if (!w.reported) continue;
      const reached = w.side === "bid" ? w.low < w.band + bin : w.high >= w.band;
      events.push({ kind: reached ? "wall_eaten" : "wall_pulled", t, side: w.side, price: w.band, size: w.max, left });
    }
    this.low = Infinity;
    this.high = -Infinity;
    return events;
  }
}

/**
 * Spoofing: a large band that had stood for a while vanishes within a second as price closes in
 * on it, and trades in the band account for little of what vanished — the size was cancelled,
 * not filled. Fed every book update (Bybit pushes about five a second), not the 10 s checks.
 * The band holding the best bid or ask is left out: quotes at the touch are cancelled and
 * re-posted all the time as price moves, which is market making, not a wall being pulled.
 */
export class SpoofWatch {
  constructor(cfg = ALERT_DEFAULTS) {
    this.cfg = cfg;
    this.bands = { bid: new Map(), ask: new Map() }; // band → BTC
    this.big = new Map(); // "bid|band" → { since, hist: [[t, size]] } while at least spoofBtc
    this.trades = []; // [t, price, qty], last few seconds
    this.typical = 0; // median band, refreshed every couple of seconds
    this.typicalAt = -Infinity;
    this.cool = new Cooldown();
  }

  // A band is "big" when it clears both the absolute floor and spoofRatio × the median band.
  bigLine(t) {
    if (t - this.typicalAt > 2_000) {
      this.typical = median([...this.bands.bid.values(), ...this.bands.ask.values()].filter((q) => q > 0));
      this.typicalAt = t;
    }
    return Math.max(this.cfg.spoofBtc, this.cfg.spoofRatio * this.typical);
  }

  /** The whole book was replaced (snapshot or reconnect) at time t; large bands are followed from then. */
  reset(t, bids, asks) {
    const bin = this.cfg.wallBin;
    this.big.clear();
    for (const [side, book] of [["bid", bids], ["ask", asks]]) {
      const m = (this.bands[side] = new Map());
      for (const [p, q] of book) {
        const band = Math.floor(p / bin) * bin;
        m.set(band, (m.get(band) ?? 0) + q);
      }
    }
    this.typicalAt = -Infinity;
    const line = this.bigLine(t);
    for (const side of ["bid", "ask"]) for (const [band, size] of this.bands[side]) if (size >= line) this.big.set(`${side}|${band}`, { since: t, hist: [[t, size]] });
  }

  trade(t, price, qty) {
    this.trades.push([t, price, qty]);
    while (this.trades.length && this.trades[0][0] < t - 5 * this.cfg.spoofWindowMs) this.trades.shift();
  }

  /** changes: [side, price, size before, size after] from OrderBook.apply; top: OrderBook.best(). */
  update(t, changes, top) {
    const { mid } = top;
    const { wallBin: bin, spoofBtc, spoofWindowMs, spoofHoldMs, spoofNearPct, spoofTradeRatio, cooldownMs } = this.cfg;
    const touched = new Set();
    for (const [side, p, before, after] of changes) {
      const band = Math.floor(p / bin) * bin;
      const m = this.bands[side];
      m.set(band, (m.get(band) ?? 0) + after - before);
      touched.add(`${side}|${band}`);
    }
    const events = [];
    const line = this.bigLine(t);
    for (const key of touched) {
      const [side, b] = key.split("|");
      const band = Number(b);
      const size = this.bands[side].get(band) ?? 0;
      let big = this.big.get(key);
      if (size >= line) {
        if (!big) this.big.set(key, (big = { since: t, hist: [] }));
        big.hist.push([t, size]);
        while (big.hist.length > 1 && big.hist[1][0] <= t - spoofWindowMs) big.hist.shift();
        continue;
      }
      if (!big) continue;
      this.big.delete(key);
      // Its size one window ago (the last sample at or before then), or anything larger since.
      let start = 0;
      for (const [ht, hs] of big.hist) start = ht <= t - spoofWindowMs ? hs : Math.max(start, hs);
      const gone = start - size;
      if (t - big.since < spoofHoldMs || gone < spoofBtc) continue;
      const touchBand = Math.floor((side === "bid" ? top.bid : top.ask) / bin) * bin;
      if (side === "bid" ? band >= touchBand : band <= touchBand) continue;
      const dist = side === "bid" ? (mid - (band + bin)) / mid : (band - mid) / mid;
      if (dist * 100 > spoofNearPct) continue;
      let traded = 0;
      for (const [tt, price, qty] of this.trades) if (tt >= t - spoofWindowMs && price >= band && price < band + bin) traded += qty;
      if (traded > spoofTradeRatio * gone) continue;
      if (!this.cool.ready(key, t, cooldownMs)) continue;
      events.push({ kind: "spoof", t, side, price: band, size: gone, traded, distPct: Math.max(0, dist * 100), heldMs: t - big.since });
    }
    return events;
  }
}

/**
 * Icebergs: far more traded at one price than was ever shown there, while the level keeps
 * refilling. A taker sell fills bids, so a bid iceberg absorbs selling.
 */
export class IcebergWatch {
  constructor(cfg = ALERT_DEFAULTS) {
    this.cfg = cfg;
    this.levels = new Map(); // "bid|price" → { side, price, filled, shown, last }
    this.cool = new Cooldown();
  }

  /** A taker trade, with the size the book showed at that price before it (the fill included). */
  trade(t, price, qty, takerSell, shownNow) {
    const side = takerSell ? "bid" : "ask";
    const key = `${side}|${price}`;
    let lv = this.levels.get(key);
    if (!lv || t - lv.last > 120_000) this.levels.set(key, (lv = { side, price, filled: 0, shown: 0, last: t }));
    lv.filled += qty;
    lv.shown = Math.max(lv.shown, shownNow ?? 0);
    lv.last = t;
  }

  /** Called with the book after updates: a level still showing size after outsized fills is a refilling iceberg. */
  check(t, bids, asks) {
    const { icebergBtc, icebergRatio, cooldownMs } = this.cfg;
    const events = [];
    for (const [key, lv] of this.levels) {
      if (t - lv.last > 120_000) {
        this.levels.delete(key);
        continue;
      }
      const now = (lv.side === "bid" ? bids : asks).get(lv.price) ?? 0;
      lv.shown = Math.max(lv.shown, now);
      if (lv.filled < icebergBtc || lv.filled < icebergRatio * lv.shown || now <= 0) continue;
      if (!this.cool.ready(key, t, cooldownMs)) continue;
      events.push({ kind: "iceberg", t, side: lv.side, price: lv.price, filled: lv.filled, shown: lv.shown });
      this.levels.delete(key);
    }
    return events;
  }
}

/** Whether a tuning value is acceptable: switches are 0 or 1, the daily cap a whole number, everything else positive. */
export function validSetting(key, value) {
  if (!(key in ALERT_DEFAULTS) || !Number.isFinite(value)) return false;
  if (key.endsWith("On")) return value === 0 || value === 1;
  return key === "dailyCap" ? Number.isInteger(value) && value >= 1 : value > 0;
}

// Closed 5-minute-bar detectors (signals.js) the collector runs; their events carry the bar's
// close as t and a dir of "up" or "down".
export const BAR_KINDS = ["absorption", "sweep", "divergence", "stackedRetest", "breakout"];
const BAR_ICONS = { absorption: "🛡️", sweep: "🪝", divergence: "↔️", stackedRetest: "🧲", breakout: "🚀" };

/** Health events are about the collector itself, not the market. */
export const HEALTH_KINDS = new Set(["health_down", "health_up", "health_archive", "health_errors", "health_unreachable"]);

const usdText = (v) => (v >= 1e6 ? `$${(v / 1e6).toFixed(1)}M` : `$${Math.round(v / 1e3)}k`);
const priceText = (p) => p.toLocaleString("en-US", { maximumFractionDigits: 1 });
const timeText = (t) => new Intl.DateTimeFormat("zh-TW", { timeZone: "Asia/Taipei", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).format(t);

/** One line of zh-Hant per event, for the LINE message. */
export function describe(e) {
  const at = timeText(e.t);
  switch (e.kind) {
    case "print":
      return `🐋 大單 ${e.side === "buy" ? "主動買" : "主動賣"} ${e.qty.toFixed(1)} BTC @ ${priceText(e.price)}（${at}）`;
    case "liq":
      return `💥 連環爆倉 ${e.side === "long" ? "多單" : "空單"} ${usdText(e.usd)}，${e.count} 筆，${priceText(e.low)}–${priceText(e.high)}（${at}）`;
    case "oi":
      return `📊 OI 5 分鐘 ${e.pct >= 0 ? "+" : ""}${e.pct.toFixed(2)}%（z ${e.z.toFixed(1)}），價格 ${e.pricePct >= 0 ? "+" : ""}${e.pricePct.toFixed(2)}%：${e.reading}（${at}）`;
    case "wall":
      return `🧱 ${e.side === "bid" ? "買單牆" : "賣單牆"} ${priceText(e.price)}–${priceText(e.price + 10)} 掛 ${e.size.toFixed(0)} BTC，已持續 ${Math.round(e.heldMs / 60_000)} 分（${at}）`;
    case "wall_eaten":
      return `🧱 ${e.side === "bid" ? "買單牆" : "賣單牆"} ${priceText(e.price)} 被吃掉（原本 ${e.size.toFixed(0)} BTC）（${at}）`;
    case "wall_pulled":
      return `🧱 ${e.side === "bid" ? "買單牆" : "賣單牆"} ${priceText(e.price)} 撤單，價格沒碰到（原本 ${e.size.toFixed(0)} BTC）（${at}）`;
    case "spoof":
      return `🎭 疑似誘單 ${e.side === "bid" ? "買單牆" : "賣單牆"} ${priceText(e.price)}–${priceText(e.price + 10)}：價格距離 ${e.distPct.toFixed(2)}% 時，1 秒內撤掉 ${e.size.toFixed(0)} BTC，期間只成交 ${e.traded.toFixed(1)} BTC（掛了 ${Math.round(e.heldMs / 1000)} 秒）（${at}）`;
    case "iceberg":
      return `🧊 冰山 ${e.side === "bid" ? "買方" : "賣方"} ${priceText(e.price)} 已成交 ${e.filled.toFixed(1)} BTC，最多只顯示 ${e.shown.toFixed(1)} BTC（${at}）`;
    case "absorption":
    case "sweep":
    case "divergence":
    case "stackedRetest":
    case "breakout":
      return `${BAR_ICONS[e.kind]} ${SIGNALS[e.kind].name}：${e.note}（5 分 K，${timeText(e.t).slice(0, 5)} 收盤）`;
    case "test":
      return `✅ 測試通知（${at}）`;
    case "health_down":
      return `⚠️ 收集器與 ${e.feed} 斷線已 ${Math.round(e.downMs / 60_000)} 分鐘${e.lastTrade ? `，最後一筆成交 ${timeText(e.lastTrade)}` : ""}（${at}）`;
    case "health_up":
      return `✅ ${e.feed} 連線恢復，中斷約 ${Math.max(1, Math.round(e.downMs / 60_000))} 分鐘${e.feed === "Bybit" ? "；缺的成交隔天由封存檔補齊" : ""}（${at}）`;
    case "health_archive":
      return `⚠️ ${e.day} 的封存檔還沒匯入：${e.reason}（${at}）`;
    case "health_errors":
      return `⚠️ 收集器 10 分鐘內有 ${e.count} 個錯誤，最近一個：${e.last}（${at}）`;
    case "health_unreachable":
      return `⚠️ 訂單流收集器沒有回應：${e.reason}（${at}）`;
    default:
      return `${e.kind}（${at}）`;
  }
}
