// Strategies B–E as rules that run over archive data, for picking replay stretches. Strategy A is
// public/lab/orderflow/strategy-failed-auction.js. Thresholds come from the lessons and the
// strategy notes and are fixed before any stretch is chosen; where a note leaves a question
// open, the default used here is listed in DEFAULTS_NOTE. Internal research only.
//
// Every finder returns trades { strat, dir, entryT, entry, stop, tp, ... }; entryT is when the
// position opens (a bar close for B, C and E, the touching minute for D's limit order).
import { readingsAt } from "../../public/lab/orderflow/metrics.js";
import { buildLiqMap } from "../../public/lab/orderflow/liqmap.js";

export const MIN = 60_000;
export const TF = 5 * MIN;
export const DAY = 86_400_000;
const HOLD = 24 * 3600_000;

export const B = {
  zonePct: 0.0015, // "at the level" (A's absorbZonePct)
  absorbRatio: 1.5,
  absorbMinQty: 50,
  confirmBars: 6, // the hold must show within 30 minutes of the touch
  acceptBars: 2, // a flip needs two closes beyond the level
  retestBars: 12, // and a re-test within an hour
  stopBufferPct: 0.001,
  targetR: 1, // lesson target one: 1.0 R
};
export const C = {
  lookback: 48, // the push makes a 4-hour high
  pushBars: 12, // the push starts at the lowest low of the 12 bars before
  minPushPct: 0.006,
  pushVolume: 1.2, // push volume vs the 48 bars before it
  maxPullback: 8,
  pullVolume: 0.6, // pullback volume vs the push
  maxRetrace: 0.618, // of the push, in price
  cvdGiveBack: 0.5, // of the push's delta
  stopBufferPct: 0.0005,
  targetR: 1,
};
// D (docs/STRATEGY-LIQ-WICK-FADE.md): M5 only, short side only, ±1 % of price.
export const D = {
  buyZ: 2.5, // "大額買單": the bar's aggressive buying vs the 48 bars before it
  window: 48,
  clusters: 20, // the model's 20 largest short-liquidation bins count as levels
  wickShare: 0.5, // upper wick at least half the bar's range
  movePct: 0.01,
};
// E (docs/STRATEGY-OPENING-RANGE-VA.md): long only.
export const E = {
  rangeMin: 30,
  valueShare: 0.7,
  breakoutUntilMin: 240, // a breakout close must come within four hours of the open
  sessionMin: 390, // re-tests count until the US close
  // The note's threshold is max(20 BTC, p99.9 of single orders), measured at 21–33 BTC. The
  // archive has no single orders, so the note's fallback applies: one minute's aggressive sells at
  // one $10 level, against the top of that measured range.
  big: 30, // BTC
  reclaimBars: 5, // M1 bars to close back above the big sell
  stopBufferPct: 0.001,
  targetR: 1.25,
};
export const DEFAULTS_NOTE = [
  "D：只用 M5、只做空；「大額買單」= 主動買量高於前 48 根平均 2.5 個標準差；爆倉位 = 模型估算空單爆倉量最大的 20 個價格格；上影線 ≥ 整根 K 棒的一半；下一根沒回到價位就放棄；停損停利 = 價格 ±1%。",
  "E：價值區 70%；停損 VAL 下方 0.1%；突破要在開盤後 4 小時內，回測算到美股收盤；M1 收在 POC 下方就放棄；大單 = 同一分鐘同一個 $10 價格格的主動賣合計 ≥ 30 BTC（文件裡的備用條件，門檻取文件實測單筆 p99.9 的上緣；歷史資料沒有逐筆成交）；大單後 5 根 M1 內要收回；目標 1.25R。",
];

/** 1-minute rows → 5-minute bars with merged price levels, delta, volume and the OI at each close. */
export function bars5(rows, readings) {
  const map = new Map();
  for (const [t, o, h, l, c, levels] of rows) {
    const k = Math.floor(t / TF) * TF;
    let b = map.get(k);
    if (!b) map.set(k, (b = { t: k, o, h, l, c, buy: 0, sell: 0, levels: new Map() }));
    b.h = Math.max(b.h, h);
    b.l = Math.min(b.l, l);
    b.c = c;
    for (const [bin, buy, sell] of levels) {
      b.buy += buy;
      b.sell += sell;
      const lv = b.levels.get(bin) ?? [0, 0];
      lv[0] += buy;
      lv[1] += sell;
      b.levels.set(bin, lv);
    }
  }
  const out = [...map.values()].sort((a, b) => a.t - b.t);
  const at = readingsAt(readings);
  for (const b of out) {
    b.delta = b.buy - b.sell;
    b.vol = b.buy + b.sell;
    b.oi = at(b.t + TF)?.[1] ?? null;
  }
  return out;
}

function imbalanceRun(bar, side) {
  const bins = [...bar.levels.keys()].sort((a, b) => a - b);
  let best = 0, run = 0, prev = null;
  for (const bin of bins) {
    const [buy, sell] = bar.levels.get(bin);
    const ok = side === "buy" ? buy >= 1 && buy >= 3 * (bar.levels.get(bin - 1)?.[1] ?? 0) : sell >= 1 && sell >= 3 * (bar.levels.get(bin + 1)?.[0] ?? 0);
    run = ok && prev === bin - 1 ? run + 1 : ok ? 1 : 0;
    prev = bin;
    best = Math.max(best, run);
  }
  return best;
}

/** Value area of a price → volume map: grow from the POC toward the heavier side until `share`. */
function valueArea(volume, tick, share) {
  const bins = [...volume.keys()].sort((a, b) => a - b);
  if (!bins.length) return null;
  const v = bins.map((b) => volume.get(b));
  const total = v.reduce((a, b) => a + b, 0);
  let poc = 0;
  for (let k = 1; k < v.length; k++) if (v[k] > v[poc]) poc = k;
  let lo = poc, hi = poc, acc = v[poc];
  while (acc < total * share && (lo > 0 || hi < v.length - 1)) {
    const down = lo > 0 ? v[lo - 1] : -1;
    const up = hi < v.length - 1 ? v[hi + 1] : -1;
    if (up >= down) acc += v[++hi];
    else acc += v[--lo];
  }
  const mid = (b) => b * tick + tick / 2;
  return { poc: mid(bins[poc]), val: mid(bins[lo]), vah: mid(bins[hi]) };
}

/** Context shared by the finders: 1-minute rows, 5-minute bars and lookups. */
export function context(rows, tick, readings) {
  return { rows, tick, readings, bars: bars5(rows, readings), rowIndex: new Map(rows.map((r, i) => [r[0], i])) };
}

/**
 * Single stop and target on 1-minute rows from the minute starting at fromT; the same minute
 * counts as the stop. Returns { result: "stop" | "tp" | "timeout" | "open", exitT }.
 */
export function simulate(ctx, fromT, dir, stop, tp, holdFrom = fromT) {
  const up = dir === "long";
  let i = ctx.rowIndex.get(fromT);
  if (i == null) return { result: "open" };
  for (; i < ctx.rows.length && ctx.rows[i][0] < holdFrom + HOLD; i++) {
    const [t, , h, l] = ctx.rows[i];
    if (up ? l <= stop : h >= stop) return { result: "stop", exitT: t + MIN };
    if (up ? h >= tp : l <= tp) return { result: "tp", exitT: t + MIN };
  }
  if (i >= ctx.rows.length) return { result: "open" };
  return { result: "timeout", exitT: ctx.rows[i][0] };
}

function zoneVolume(bars, tick, i, j, lo, hi) {
  let buy = 0, sell = 0;
  for (let k = i; k <= j; k++)
    for (const [bin, [b, s]] of bars[k].levels) {
      const p = bin * tick + tick / 2;
      if (p >= lo && p <= hi) (buy += b), (sell += s);
    }
  return { buy, sell };
}

// B: the first arrival of the day at a prior-day level, then either the hold (absorption and a
// close back outside the zone) or the flip (two closes through it, then a failed re-test).
const LEVELS = [["low", "前日低"], ["val", "前日 VAL"], ["poc", "前日 POC"], ["vah", "前日 VAH"], ["high", "前日高"]];
export function findB(ctx, profiles) {
  const { bars, tick } = ctx;
  const trades = [];
  for (const [key, name] of LEVELS) {
    const touched = new Set();
    for (let i = 1; i < bars.length; i++) {
      const b = bars[i];
      const day = Math.floor(b.t / DAY);
      const prior = profiles.get(day - 1);
      if (!prior) continue;
      const L = prior[key];
      const z = L * B.zonePct;
      const prev = bars[i - 1];
      const fromAbove = prev.l > L + z && b.l <= L + z;
      const fromBelow = prev.h < L - z && b.h >= L - z;
      if (!(fromAbove || fromBelow) || touched.has(`${day}|${fromAbove}`)) continue;
      touched.add(`${day}|${fromAbove}`);
      const up = fromAbove; // support when arriving from above
      let done = false;
      let extreme = up ? b.l : b.h;
      for (let j = i; j < Math.min(bars.length, i + B.confirmBars) && !done; j++) {
        const x = bars[j];
        extreme = up ? Math.min(extreme, x.l) : Math.max(extreme, x.h);
        if (up ? x.c < L - z : x.c > L + z) break; // closed through: maybe a flip, below
        const away = up ? x.c > L + z : x.c < L - z;
        if (!away || j === i) continue;
        const v = zoneVolume(bars, tick, i, j, L - z, L + z);
        const hit = up ? v.sell : v.buy;
        const ok = hit >= B.absorbMinQty && hit >= B.absorbRatio * (up ? v.buy : v.sell) && (imbalanceRun(x, up ? "buy" : "sell") >= 2 || (up ? x.delta > 0 : x.delta < 0));
        if (!ok) break;
        const entry = x.c;
        const stop = up ? extreme * (1 - B.stopBufferPct) : extreme * (1 + B.stopBufferPct);
        const tp = entry + (up ? 1 : -1) * B.targetR * Math.abs(entry - stop);
        trades.push({ strat: "B", kind: "hold", dir: up ? "long" : "short", level: name, levelPrice: L, signalT: x.t, entryT: x.t + TF, entry, stop, tp, absorb: Math.round(hit) });
        done = true;
      }
      if (done) continue;
      let k = -1;
      for (let j = i; j < Math.min(bars.length, i + B.confirmBars); j++) if (up ? bars[j].c < L - z : bars[j].c > L + z) { k = j; break; }
      if (k < 0) continue;
      let accepted = true;
      for (let j = k + 1; j <= k + B.acceptBars - 1; j++) if (!bars[j] || (up ? bars[j].c >= L : bars[j].c <= L)) accepted = false;
      if (!accepted) continue;
      for (let j = k + B.acceptBars; j < Math.min(bars.length, k + B.acceptBars + B.retestBars); j++) {
        const x = bars[j];
        if (up ? x.c > L + z : x.c < L - z) break; // reclaimed: no flip
        const retest = up ? x.h >= L - z : x.l <= L + z;
        if (!retest) continue;
        const fails = up ? x.c < L && (imbalanceRun(x, "sell") >= 2 || x.delta < 0) : x.c > L && (imbalanceRun(x, "buy") >= 2 || x.delta > 0);
        if (!fails) continue;
        const entry = x.c;
        const stop = up ? x.h * (1 + B.stopBufferPct) : x.l * (1 - B.stopBufferPct);
        const tp = entry + (up ? -1 : 1) * B.targetR * Math.abs(entry - stop);
        trades.push({ strat: "B", kind: "flip", dir: up ? "short" : "long", level: name, levelPrice: L, signalT: x.t, entryT: x.t + TF, entry, stop, tp });
        break;
      }
    }
  }
  return trades;
}

// C: a push to a 4-hour extreme on rising volume, a quiet pullback with lower highs (higher lows
// for shorts) that gives back under half the push's delta while OI does not rise, then the first
// bar that closes through the pullback's last swing with delta on its side.
export function findC(ctx) {
  const { bars } = ctx;
  const trades = [];
  const avgVol = (i, j) => {
    let s = 0;
    for (let k = i; k <= j; k++) s += bars[k].vol;
    return s / (j - i + 1);
  };
  for (let k = C.lookback + C.pushBars; k < bars.length - 2; k++) {
    for (const up of [true, false]) {
      const top = bars[k];
      let ext = true;
      for (let j = k - C.lookback; j < k; j++) if (up ? bars[j].h >= top.h : bars[j].l <= top.l) { ext = false; break; }
      if (!ext) continue;
      let s = k - C.pushBars;
      for (let j = k - C.pushBars; j < k; j++) if (up ? bars[j].l < bars[s].l : bars[j].h > bars[s].h) s = j;
      const start = up ? bars[s].l : bars[s].h;
      const end = up ? top.h : top.l;
      const move = Math.abs(end - start);
      if (move / start < C.minPushPct) continue;
      const pushVol = avgVol(s, k);
      if (s - C.lookback < 0 || pushVol < C.pushVolume * avgVol(s - C.lookback, s - 1)) continue;
      let pushDelta = 0;
      for (let j = s; j <= k; j++) pushDelta += bars[j].delta;
      if (up ? pushDelta <= 0 : pushDelta >= 0) continue;
      let swing = up ? top.h : top.l; // last lower high / higher low
      let lowest = up ? Infinity : -Infinity;
      let cvd = 0;
      for (let m = k + 1; m < Math.min(bars.length - 1, k + 1 + C.maxPullback + 1); m++) {
        const x = bars[m];
        if (up ? x.h > top.h : x.l < top.l) break; // new extreme: the push continues, not a pullback
        const pulled = m - k - 1; // bars of pullback before x
        if (pulled >= 2) {
          const breaks = up ? x.c > swing && x.delta > 0 : x.c < swing && x.delta < 0;
          if (breaks) {
            const quiet = avgVol(k + 1, m - 1) <= C.pullVolume * pushVol;
            const shallow = Math.abs(end - lowest) <= C.maxRetrace * move;
            const kept = up ? cvd >= -C.cvdGiveBack * pushDelta : cvd <= -C.cvdGiveBack * pushDelta;
            const oiOk = bars[m - 1].oi != null && top.oi != null && bars[m - 1].oi <= top.oi;
            if (quiet && shallow && kept && oiOk) {
              const entry = x.c;
              const stop = up ? lowest * (1 - C.stopBufferPct) : lowest * (1 + C.stopBufferPct);
              const tp = entry + (up ? 1 : -1) * C.targetR * Math.abs(entry - stop);
              trades.push({ strat: "C", dir: up ? "long" : "short", signalT: x.t, entryT: x.t + TF, entry, stop, tp, push: { from: bars[s].t, to: top.t, start, end }, swing });
            }
            break;
          }
        }
        if (pulled >= 1 && (up ? x.h > swing : x.l < swing)) break; // highs must keep falling
        swing = up ? Math.min(swing, x.h) : Math.max(swing, x.l);
        lowest = up ? Math.min(lowest, x.l) : Math.max(lowest, x.h);
        cvd += x.delta;
        if (Math.abs(end - lowest) > C.maxRetrace * move) break;
      }
    }
  }
  return trades;
}

// D: a bar with outsized aggressive buying runs through one of the model's largest short-
// liquidation levels and closes with an upper wick; the next bar comes back up to the price where
// that bar's aggressive selling was heaviest, and a limit short fills there. Stop and target ±1 %.
export function findD(ctx) {
  const { bars, rows, tick, readings } = ctx;
  // The model's largest short-liquidation bins at each 5-minute step, before that interval trades.
  const clusters = new Map();
  buildLiqMap(rows, tick, readings.map((r) => [r[0], r[1]]), {
    keepSteps: false,
    onStep: (t, _w, { lo, short }) => {
      const top = [];
      for (let i = 0; i < short.length; i++) if (short[i] > 0) top.push([short[i], i]);
      top.sort((a, b) => b[0] - a[0]);
      clusters.set(t, top.slice(0, D.clusters).map(([q, i]) => ({ price: lo + i * 25 + 12.5, qty: q })));
    },
  });
  const trades = [];
  for (let i = D.window; i < bars.length - 1; i++) {
    const a = bars[i];
    let mean = 0, sq = 0;
    for (let j = i - D.window; j < i; j++) mean += bars[j].buy;
    mean /= D.window;
    for (let j = i - D.window; j < i; j++) sq += (bars[j].buy - mean) ** 2;
    const sd = Math.sqrt(sq / D.window);
    if (!sd || (a.buy - mean) / sd < D.buyZ || a.delta <= 0) continue;
    const levels = clusters.get(a.t) ?? [];
    const broke = levels.filter((c) => c.price > bars[i - 1].h && c.price <= a.h);
    if (!broke.length) continue;
    const range = a.h - a.l;
    if (!range || a.h - Math.max(a.o, a.c) < D.wickShare * range) continue;
    let maxBin = null, maxSell = -1;
    for (const [bin, [, sell]] of a.levels) if (sell > maxSell) (maxSell = sell), (maxBin = bin);
    const level = maxBin * tick + tick / 2;
    const b = bars[i + 1];
    if (b.o >= level || b.h < level) continue; // must come back up to it within the next bar
    let minute = null;
    for (let t = b.t; t < b.t + TF; t += MIN) {
      const r = rows[ctx.rowIndex.get(t)];
      if (r && r[2] >= level) { minute = t; break; }
    }
    if (minute == null) continue;
    const entry = level;
    const stop = entry * (1 + D.movePct);
    const tp = entry * (1 - D.movePct);
    const cluster = broke.sort((x, y) => y.qty - x.qty)[0];
    trades.push({ strat: "D", dir: "short", signalT: a.t, entryT: minute, entry, stop, tp, cluster: cluster.price, sellLevel: level, wickBar: a.t, fillMinute: true });
  }
  return trades;
}

/** UTC time of 9:30 New York on the UTC calendar day containing t. */
function usOpen(t) {
  const d = new Date(Math.floor(t / DAY) * DAY);
  const noon = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 16);
  const off = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", timeZoneName: "shortOffset" }).formatToParts(noon).find((p) => p.type === "timeZoneName").value;
  const hours = Number(off.replace("GMT", "")) || 0; // -4 or -5
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 9, 30) - hours * 3600_000;
}

// E: the first 30 minutes after the US open set a value area; an M5 close above its VAH is the
// breakout; no chase; back between VAH and POC, a heavy aggressive sell at one $10 level in one
// minute that price then closes back above within five minutes is the entry. Stop under VAL.
export function findE(ctx) {
  const { rows, tick, bars, rowIndex } = ctx;
  const days = [...new Set(rows.map((r) => Math.floor(r[0] / DAY)))].sort((a, b) => a - b);
  const trades = [];
  for (const day of days) {
    const open = usOpen(day * DAY);
    const at = (t) => rows[rowIndex.get(t)];
    if (!at(open) || !at(open + E.sessionMin * MIN - MIN)) continue;
    const big = E.big;
    const volume = new Map();
    for (let t = open; t < open + E.rangeMin * MIN; t += MIN) for (const [bin, b, s] of at(t)?.[5] ?? []) volume.set(bin, (volume.get(bin) ?? 0) + b + s);
    const va = valueArea(volume, tick, E.valueShare);
    if (!va || va.vah <= va.poc) continue;
    // Breakout: the first M5 close above VAH after the opening range.
    const first = bars.findIndex((b) => b.t >= open + E.rangeMin * MIN);
    let brk = -1;
    for (let i = first; i >= 0 && i < bars.length && bars[i].t < open + E.breakoutUntilMin * MIN; i++) if (bars[i].c > va.vah) { brk = i; break; }
    if (brk < 0) continue;
    // Re-test on M1 until the close; give up on a close under POC.
    let trade = null;
    for (let t = bars[brk].t + TF; t < open + E.sessionMin * MIN && !trade; t += MIN) {
      const r = at(t);
      if (!r) continue;
      if (r[4] < va.poc) break;
      if (r[3] > va.vah) continue;
      let hit = null;
      for (const [bin, , s] of r[5]) {
        const p = bin * tick + tick / 2;
        if (p >= va.poc && p <= va.vah && s >= big && (!hit || s > hit.qty)) hit = { price: p, top: (bin + 1) * tick, qty: s };
      }
      if (!hit) continue;
      for (let k = 1; k <= E.reclaimBars; k++) {
        const x = at(t + k * MIN);
        if (!x || x[4] < va.poc) break;
        if (x[4] > hit.top) {
          const entry = x[4];
          const stop = va.val * (1 - E.stopBufferPct);
          if (entry <= stop) break;
          trade = { strat: "E", dir: "long", signalT: t + k * MIN, entryT: t + (k + 1) * MIN, entry, stop, tp: entry + E.targetR * (entry - stop), open, va, big: { t, price: hit.price, qty: Math.round(hit.qty), threshold: Math.round(big) } };
          break;
        }
      }
    }
    if (trade) trades.push(trade);
  }
  return trades;
}
