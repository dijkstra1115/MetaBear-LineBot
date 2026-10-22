// Key levels for location-filtered alerts (docs/ORDERFLOW-KEYLEVEL-ALERTS.md), shared by the
// collector and the key-level backtest so both see the same levels at the same moment.
//
// Sessions are UTC days (08:00 in Taiwan): the daily candle traders compare against on Bybit and
// TradingView, and the days Bybit's trade archives cover (docs/ORDERFLOW-ALERT-SUBSCRIPTION.md).
// The 2026-10-20 backtest used Taiwan days and passes TAIPEI_OFFSET_MS to reproduce them. The
// levels are the previous session's high, low, POC, VAH and VAL, the current session's VWAP, and
// stacked-imbalance zones that price has not come back to yet. A LevelBook only learns from closed
// 1-minute rows.

import { aggregate, detectAt, valueArea } from "./signals.js";
import { BAR_KINDS } from "./watch.js";

export const MINUTE_MS = 60_000;
export const SESSION_MS = 86_400_000;
export const TAIPEI_OFFSET_MS = 8 * 3_600_000; // Taiwan has no daylight saving time

export const LEVEL_DEFAULTS = {
  tolPct: 0.1, // an event counts when it is this close to a level (percent of its price)
  vwapAfterMs: 60 * MINUTE_MS, // VWAP is skipped early in a session, when it is still the price itself
  stackLifeMs: 2 * 3_600_000, // a stacked-imbalance zone stays a level this long…
  stackAfterTouchMs: 5 * MINUTE_MS, // …or until this long after price first returns to it
  sessionOffsetMs: 0, // UTC days; TAIPEI_OFFSET_MS gives Taiwan days
};

export const LEVEL_LABELS = { pdh: "前日高", pdl: "前日低", poc: "前日 POC", vah: "前日 VAH", val: "前日 VAL", vwap: "VWAP", stack: "堆疊區" };

/** The session (a UTC day unless offset) a time falls in, as a day number. */
export function sessionOf(t, offsetMs = 0) {
  return Math.floor((t + offsetMs) / SESSION_MS);
}

/** When a session (from sessionOf) starts, in UTC milliseconds. */
export function sessionStart(session, offsetMs = 0) {
  return session * SESSION_MS - offsetMs;
}

/** High, low and value area of a session's volume by $-bin. */
function profileOf(s, tick) {
  const va = valueArea(s.volume);
  const mid = (bin) => bin * tick + tick / 2;
  return { high: s.high, low: s.low, ...(va ? { poc: mid(va.poc), vah: mid(va.vah), val: mid(va.val) } : {}) };
}

export class LevelBook {
  constructor(tick, cfg = LEVEL_DEFAULTS) {
    this.tick = tick;
    this.cfg = cfg;
    this.reset();
  }

  reset() {
    this.session = null; // { id, high, low, volume, pv, v }
    this.prior = null; // { id, high, low, poc, vah, val }
    this.zones = []; // { t, lo, hi, dir, touched }
    this.recent = []; // rows of the 5-minute bar being built, for stacked imbalances
    this.through = 0; // the last minute added
    this.closing = null; // profile of the session in progress, cached while no new minute comes
  }

  /** Adds one closed 1-minute row [t, o, h, l, c, [[bin, buy, sell]…]]; rows must come in time order. */
  addMinute(row) {
    const [t, , h, l, , levels = []] = row;
    if (t <= this.through) return;
    this.through = t;
    const id = sessionOf(t, this.cfg.sessionOffsetMs);
    if (this.session?.id !== id) {
      // A session the book saw only part of still becomes the prior one; the collector
      // replays the whole previous session after a restart.
      if (this.session && this.session.id === id - 1) this.prior = { id: this.session.id, ...profileOf(this.session, this.tick) };
      else if (this.session) this.prior = null;
      this.session = { id, high: -Infinity, low: Infinity, volume: new Map(), pv: 0, v: 0, start: t };
    }
    const s = this.session;
    if (h > s.high) s.high = h;
    if (l < s.low) s.low = l;
    for (const [bin, buy, sell] of levels) {
      const q = buy + sell;
      s.volume.set(bin, (s.volume.get(bin) ?? 0) + q);
      s.pv += (bin * this.tick + this.tick / 2) * q;
      s.v += q;
    }
    for (const z of this.zones) if (z.touched == null && l <= z.hi && h >= z.lo) z.touched = t;
    this.zones = this.zones.filter((z) => this.zoneLive(z, t + MINUTE_MS));
    // A 5-minute bar closes with this minute: look for a stacked imbalance in it.
    this.recent.push(row);
    const end = t + MINUTE_MS;
    if (end % (5 * MINUTE_MS) === 0) {
      const bars = aggregate(this.recent.filter((r) => r[0] >= end - 10 * MINUTE_MS), this.tick, [], end);
      const i = bars.findIndex((b) => b.end === end);
      const s5 = i >= 0 ? detectAt("stacked", bars, i) : null;
      if (s5) this.zones.push({ t: end, lo: s5.zone[0], hi: s5.zone[1], dir: s5.dir, touched: null });
      this.recent = this.recent.filter((r) => r[0] >= end - 5 * MINUTE_MS);
    }
  }

  zoneLive(z, t) {
    if (t - z.t >= this.cfg.stackLifeMs) return false;
    return z.touched == null || t - z.touched <= this.cfg.stackAfterTouchMs;
  }

  /** The levels in force at time t (after the minutes added so far): [{ name, price }]. */
  levels(t) {
    const out = [];
    const id = sessionOf(t, this.cfg.sessionOffsetMs);
    let p = this.prior && this.prior.id === id - 1 ? this.prior : null;
    // No minute of the new session yet: the session in progress has just become the previous one.
    if (!p && this.session?.id === id - 1) {
      if (this.closing?.through !== this.through) this.closing = { through: this.through, profile: profileOf(this.session, this.tick) };
      p = this.closing.profile;
    }
    if (p) {
      out.push({ name: "pdh", price: p.high }, { name: "pdl", price: p.low });
      if (p.poc != null) out.push({ name: "poc", price: p.poc }, { name: "vah", price: p.vah }, { name: "val", price: p.val });
    }
    const s = this.session;
    if (s && s.id === id && s.v > 0 && t - sessionStart(id, this.cfg.sessionOffsetMs) >= this.cfg.vwapAfterMs) out.push({ name: "vwap", price: s.pv / s.v });
    for (const z of this.zones) if (z.t <= t && this.zoneLive(z, t)) out.push({ name: "stack", price: (z.lo + z.hi) / 2 });
    return out;
  }

  /** The nearest level to price at time t, with its distance in USD, or null when there are none. */
  nearest(t, price) {
    let best = null;
    for (const L of this.levels(t)) {
      const dist = Math.abs(L.price - price);
      if (!best || dist < best.dist) best = { ...L, dist };
    }
    return best;
  }

  /** The level within tolPct of price, or null. */
  near(t, price, tolPct = this.cfg.tolPct) {
    const n = this.nearest(t, price);
    return n && n.dist <= (price * tolPct) / 100 ? n : null;
  }
}

/**
 * The bar detectors the collector runs (watch.js BAR_KINDS) on the 5-minute bar closing at `end`,
 * as alert events. `levels` are a LevelBook's at that moment, so a sweep is of the same levels
 * every other alert is placed against; whether an event counts as at a level is still the gate's
 * call. `rows` are 1-minute rows before `end`, enough of them for the detectors' history.
 */
export function closedBarEvents(rows, tick, levels, end) {
  const bars = aggregate(rows, tick, [], end);
  const i = bars.length - 1;
  if (i < 0 || bars[i].end !== end) return [];
  bars[i].keyLevels = levels.map((L) => ({ name: LEVEL_LABELS[L.name] ?? L.name, price: L.price }));
  const out = [];
  for (const kind of BAR_KINDS) {
    const e = detectAt(kind === "sweep" ? "sweepLevel" : kind, bars, i);
    if (e?.dir) out.push({ kind, t: end, price: e.price, side: e.dir, note: e.note });
  }
  return out;
}

/**
 * Each UTC day's previous-day high, low, POC, VAH and VAL from 1-minute rows, for the lab chart:
 * Map(session → [{ name, price }]), the values a LevelBook holds during that session.
 */
export function priorDayLevels(rows, tick) {
  const days = new Map();
  for (const [t, , h, l, , levels = []] of rows) {
    const d = sessionOf(t);
    let s = days.get(d);
    if (!s) days.set(d, (s = { high: -Infinity, low: Infinity, volume: new Map() }));
    if (h > s.high) s.high = h;
    if (l < s.low) s.low = l;
    for (const [bin, buy, sell] of levels) s.volume.set(bin, (s.volume.get(bin) ?? 0) + buy + sell);
  }
  const out = new Map();
  for (const [d, s] of days) {
    const p = profileOf(s, tick);
    const list = [
      { name: "pdh", price: p.high },
      { name: "pdl", price: p.low },
    ];
    if (p.poc != null) list.push({ name: "poc", price: p.poc }, { name: "vah", price: p.vah }, { name: "val", price: p.val });
    out.set(d + 1, list);
  }
  return out;
}

/**
 * The price an alert event happened at, for the location filter (watch.js events and bar detectors).
 * @param {{ kind: string, [k: string]: any }} e
 * @param {number | null} [fallback] the last price, for events without one of their own
 * @param {number} [bin] the band width of wall and spoofing events
 * @returns {number | null}
 */
export function eventPrice(e, fallback = null, bin = 10) {
  switch (e.kind) {
    case "liq":
      return e.side === "long" ? e.low : e.high;
    case "wall":
    case "wall_eaten":
    case "wall_pulled":
    case "spoof":
      return e.price + bin / 2; // the middle of the $10 band
    case "oi":
      return fallback;
    default:
      return typeof e.price === "number" ? e.price : fallback;
  }
}

/** "前日高 82,450（差 $35）" */
export function levelText(L) {
  return `${LEVEL_LABELS[L.name] ?? L.name} ${Math.round(L.price).toLocaleString("en-US")}（差 $${Math.round(L.dist)}）`;
}
