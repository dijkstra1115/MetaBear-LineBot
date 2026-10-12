// Order-flow event detectors, shared by the lab page, the backtest and (later) the
// collector. They describe what happened on the tape; they are not trade calls.
//
// Every detector looks only at bars that have closed, so a backtest sees exactly what
// a live run would have seen. All thresholds live in P so a backtest can be reproduced.

export const P = {
  tfMs: 5 * 60_000,
  statsWindow: 48, // bars of history for z-scores and medians (4 h at 5 m)
  extremeLookback: 12, // "new high/low" means beyond the previous 12 bars (1 h)
  swingLookback: 24, // swing levels and ranges come from the previous 24 bars (2 h)
  absorptionDeltaZ: 2,
  sweepMaxPct: 0.003, // a sweep pokes at most 0.3 % past the level
  imbalanceRatio: 3,
  imbalanceMinQty: 1, // BTC on the dominant side of a level
  imbalanceStack: 3,
  breakoutVolumeZ: 2,
  oiZ: 2.5,
  oiWindow: 288, // 5-minute OI changes over the previous 24 h
  cooldownBars: 6, // one event of a kind and direction per 30 min
  levelTolPct: 0.0015, // "at a key level" means within 0.15 % of it
  stackedMinShare: 1.5, // a stacked level must also trade 1.5× the bar's median level volume
  retestBars: 24, // a stacked-imbalance zone stays live for 2 h
  liqSweepZ: 2, // model-liquidated volume vs the previous day's non-zero sweeps (log scale)
  confluenceBars: 3, // reversal evidence counted over the last 15 min
  confluenceMin: 2, // distinct kinds of evidence pointing the same way
};

export const SIGNALS = {
  absorption: { name: "吸收", lesson: "absorption-story" },
  sweep: { name: "掃蕩收回", lesson: "failed-auction" },
  stacked: { name: "堆疊不平衡", lesson: "imbalance" },
  divergence: { name: "CVD 背離", lesson: "delta-concept" },
  breakout: { name: "放量突破", lesson: "breakout-volume" },
  oi: { name: "OI 異動", lesson: "open-interest" },
  absorptionLevel: { name: "關鍵價位吸收", lesson: "absorption-story" },
  sweepLevel: { name: "關鍵價位掃蕩", lesson: "failed-auction" },
  divergenceLevel: { name: "關鍵價位背離", lesson: "delta-concept" },
  stackedRetest: { name: "不平衡區回測", lesson: "imbalance" },
  liqSweep: { name: "強平區掃蕩", lesson: "liquidation" },
  confluence: { name: "共振反轉", lesson: "failed-auction" },
};

/** Attaches the liquidation model's swept volume (BTC) to the bar that closes at each step. */
export function attachLiqWipes(bars, wipes) {
  for (const b of bars) b.wipe = wipes.get(b.end) ?? null;
}

// What the lab page shows; the unfiltered versions stay for comparison in backtests.
export const DEFAULT_KINDS = ["absorptionLevel", "sweepLevel", "divergenceLevel", "stackedRetest", "breakout", "oi"];

/** 1-minute rows [t, o, h, l, c, [[bin, buy, sell]…], xbuy?, xsell?] → closed 5-minute bars. */
export function aggregate(rows, tick, metrics = [], now = Infinity) {
  const map = new Map();
  for (const [t, o, h, l, c, levels, xbuy = 0, xsell = 0] of rows) {
    const key = Math.floor(t / P.tfMs) * P.tfMs;
    let b = map.get(key);
    if (!b) map.set(key, (b = { t: key, o, h, l, c, levels: new Map(), buy: 0, sell: 0, detail: true }));
    if (h > b.h) b.h = h;
    if (l < b.l) b.l = l;
    b.c = c;
    b.buy += xbuy;
    b.sell += xsell;
    if (!levels.length) b.detail = false;
    for (const [bin, buy, sell] of levels) {
      const lv = b.levels.get(bin);
      if (lv) {
        lv[0] += buy;
        lv[1] += sell;
      } else b.levels.set(bin, [buy, sell]);
      b.buy += buy;
      b.sell += sell;
    }
  }
  let cvd = 0;
  let m = 0;
  const bars = [];
  for (const b of [...map.values()].sort((x, y) => x.t - y.t)) {
    b.end = b.t + P.tfMs;
    if (b.end > now) break; // still forming
    b.delta = b.buy - b.sell;
    b.volume = b.buy + b.sell;
    cvd += b.delta;
    b.cvd = cvd;
    b.tick = tick;
    while (m + 1 < metrics.length && metrics[m + 1][0] <= b.end) m++;
    b.oi = metrics[m] && metrics[m][0] <= b.end ? metrics[m][1] : null;
    bars.push(b);
  }
  attachLevels(bars);
  return bars;
}

// Value area: grow from the POC toward the heavier neighbour until 70 % of volume.
function valueArea(volumeByBin) {
  const bins = [...volumeByBin.keys()].sort((x, y) => x - y);
  if (!bins.length) return null;
  const vol = bins.map((b) => volumeByBin.get(b));
  const total = vol.reduce((x, y) => x + y, 0);
  let poc = 0;
  for (let k = 1; k < vol.length; k++) if (vol[k] > vol[poc]) poc = k;
  let lo = poc;
  let hi = poc;
  let acc = vol[poc];
  while (acc < total * 0.7 && (lo > 0 || hi < vol.length - 1)) {
    const down = lo > 0 ? vol[lo - 1] : -1;
    const up = hi < vol.length - 1 ? vol[hi + 1] : -1;
    if (up >= down) acc += vol[++hi];
    else acc += vol[--lo];
  }
  return { poc: bins[poc], vah: bins[hi], val: bins[lo] };
}

/** Gives every bar the previous UTC day's high, low, POC, VAH and VAL as b.keyLevels. */
function attachLevels(bars) {
  const days = new Map();
  for (const b of bars) {
    const day = Math.floor(b.t / 86_400_000);
    let d = days.get(day);
    if (!d) days.set(day, (d = { high: -Infinity, low: Infinity, volume: new Map(), tick: b.tick }));
    d.high = Math.max(d.high, b.h);
    d.low = Math.min(d.low, b.l);
    for (const [bin, [buy, sell]] of b.levels) d.volume.set(bin, (d.volume.get(bin) ?? 0) + buy + sell);
  }
  const levelsOf = new Map();
  for (const [day, d] of days) {
    const va = valueArea(d.volume);
    const mid = (bin) => bin * d.tick + d.tick / 2;
    const list = [
      { name: "前日高", price: d.high },
      { name: "前日低", price: d.low },
    ];
    if (va) list.push({ name: "前日 POC", price: mid(va.poc) }, { name: "前日 VAH", price: mid(va.vah) }, { name: "前日 VAL", price: mid(va.val) });
    levelsOf.set(day + 1, list);
  }
  for (const b of bars) b.keyLevels = levelsOf.get(Math.floor(b.t / 86_400_000)) ?? [];
}

/** The key level the price is at, or that lies between from and to (price traded through it). */
function levelNear(b, price, through) {
  const tol = price * P.levelTolPct;
  return b.keyLevels.find(
    (L) => Math.abs(L.price - price) <= tol || (through != null && L.price >= Math.min(price, through) && L.price <= Math.max(price, through)),
  );
}

const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[s.length >> 1] : 0;
};
function zScore(x, xs) {
  if (xs.length < 10) return 0;
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
  const sd = Math.sqrt(xs.reduce((a, b) => a + (b - mean) ** 2, 0) / xs.length);
  return sd ? (x - mean) / sd : 0;
}
const hi = (bars, a, b) => Math.max(...bars.slice(Math.max(0, a), b).map((x) => x.h));
const lo = (bars, a, b) => Math.min(...bars.slice(Math.max(0, a), b).map((x) => x.l));

// Each detector: (bars, i) → event | null, using bars[0..i] only.
const DETECTORS = {
  // Heavy aggression into a fresh extreme that does not carry price: the other side absorbed it.
  absorption(bars, i) {
    const b = bars[i];
    if (i < P.statsWindow) return null;
    const hist = bars.slice(i - P.statsWindow, i);
    const z = zScore(b.delta, hist.map((x) => x.delta));
    const mid = (b.h + b.l) / 2;
    if (b.h > hi(bars, i - P.extremeLookback, i) && z >= P.absorptionDeltaZ && b.c <= mid)
      return { dir: "down", price: b.h, note: `買方 Delta z=${z.toFixed(1)} 推上新高，收在下半部` };
    if (b.l < lo(bars, i - P.extremeLookback, i) && z <= -P.absorptionDeltaZ && b.c >= mid)
      return { dir: "up", price: b.l, note: `賣方 Delta z=${z.toFixed(1)} 壓出新低，收在上半部` };
    return null;
  },

  // Price pokes past a swing level, finds nothing there, and closes back inside.
  sweep(bars, i) {
    if (i < P.swingLookback + 2) return null;
    const b = bars[i];
    for (const j of [i, i - 1]) {
      const s = bars[j];
      const top = hi(bars, j - P.swingLookback, j - 2);
      const bottom = lo(bars, j - P.swingLookback, j - 2);
      // Reclaimed on this bar: the sweep bar itself closed back inside, or it closed
      // outside and this one closed back in.
      const backBelow = j === i ? b.c < top : bars[i - 1].c >= top && b.c < top;
      const backAbove = j === i ? b.c > bottom : bars[i - 1].c <= bottom && b.c > bottom;
      if (s.h > top && s.h <= top * (1 + P.sweepMaxPct) && backBelow)
        return { dir: "down", price: top, note: `刺穿前高 ${top} 後收回` };
      if (s.l < bottom && s.l >= bottom * (1 - P.sweepMaxPct) && backAbove)
        return { dir: "up", price: bottom, note: `跌破前低 ${bottom} 後收回` };
    }
    return null;
  },

  // Three or more consecutive diagonal imbalances on one side inside a bar.
  stacked(bars, i) {
    const b = bars[i];
    if (b.stack !== undefined) return b.stack;
    b.stack = null;
    if (!b.detail || b.levels.size < P.imbalanceStack) return null;
    const bins = [...b.levels.keys()].sort((x, y) => x - y);
    const minQty = Math.max(P.imbalanceMinQty, P.stackedMinShare * median([...b.levels.values()].map(([x, y]) => x + y)));
    const runs = { buy: [], sell: [] };
    let buyRun = [];
    let sellRun = [];
    for (const bin of bins) {
      const [buy, sell] = b.levels.get(bin);
      const below = b.levels.get(bin - 1);
      const above = b.levels.get(bin + 1);
      const buyImb = buy >= minQty && buy >= P.imbalanceRatio * (below ? below[1] : 0);
      const sellImb = sell >= minQty && sell >= P.imbalanceRatio * (above ? above[0] : 0);
      buyRun = buyImb && buyRun.at(-1) === bin - 1 ? [...buyRun, bin] : buyImb ? [bin] : [];
      sellRun = sellImb && sellRun.at(-1) === bin - 1 ? [...sellRun, bin] : sellImb ? [bin] : [];
      if (buyRun.length >= P.imbalanceStack) runs.buy = buyRun;
      if (sellRun.length >= P.imbalanceStack) runs.sell = sellRun;
    }
    const pick = runs.buy.length >= runs.sell.length ? "buy" : "sell";
    const run = runs[pick];
    if (!run.length) return null;
    const zone = [run[0] * b.tick, (run.at(-1) + 1) * b.tick];
    return (b.stack = {
      dir: pick === "buy" ? "up" : "down",
      price: (zone[0] + zone[1]) / 2,
      zone,
      note: `${run.length} 層${pick === "buy" ? "買方" : "賣方"}不平衡 ${zone[0]}–${zone[1]}`,
    });
  },

  // The first return to a stacked-imbalance zone, and the zone holds on the close.
  stackedRetest(bars, i) {
    const b = bars[i];
    for (let k = i - 2; k >= Math.max(0, i - P.retestBars); k--) {
      const s = DETECTORS.stacked(bars, k);
      if (!s) continue;
      const [z0, z1] = s.zone;
      const touches = (x) => (s.dir === "up" ? x.l <= z1 : x.h >= z0);
      let fresh = true;
      for (let j = k + 1; j < i && fresh; j++) if (touches(bars[j])) fresh = false;
      if (!fresh || !touches(b)) continue;
      if (s.dir === "up" && b.c > z0) return { dir: "up", price: z1, zone: s.zone, note: `回測買方不平衡區 ${z0}–${z1} 並守住` };
      if (s.dir === "down" && b.c < z1) return { dir: "down", price: z0, zone: s.zone, note: `回測賣方不平衡區 ${z0}–${z1} 並守住` };
    }
    return null;
  },

  // A large estimated liquidation cluster is run over and price closes back the other way.
  liqSweep(bars, i) {
    const b = bars[i];
    if (!b.wipe || i < 60) return null;
    const history = (side) => {
      const xs = [];
      for (let k = Math.max(0, i - 288); k < i; k++) if (bars[k].wipe?.[side] > 0) xs.push(Math.log1p(bars[k].wipe[side]));
      return xs;
    };
    const mid = (b.h + b.l) / 2;
    if (b.wipe.wipedLong > 0 && b.c >= mid) {
      const z = zScore(Math.log1p(b.wipe.wipedLong), history("wipedLong"));
      if (z >= P.liqSweepZ) return { dir: "up", price: b.l, note: `掃過預估多單強平區（約 ${b.wipe.wipedLong.toFixed(0)} BTC）後收在上半部` };
    }
    if (b.wipe.wipedShort > 0 && b.c <= mid) {
      const z = zScore(Math.log1p(b.wipe.wipedShort), history("wipedShort"));
      if (z >= P.liqSweepZ) return { dir: "down", price: b.h, note: `掃過預估空單強平區（約 ${b.wipe.wipedShort.toFixed(0)} BTC）後收在下半部` };
    }
    return null;
  },

  // Two or more different kinds of reversal evidence agreeing within 15 min, one of them at a key level.
  confluence(bars, i) {
    const votes = { up: new Map(), down: new Map() };
    for (let j = Math.max(1, i - P.confluenceBars + 1); j <= i; j++) {
      const bj = bars[j];
      bj.evidence ??= {};
      for (const kind of ["absorption", "sweep", "divergence", "liqSweep"]) {
        if (!(kind in bj.evidence)) bj.evidence[kind] = DETECTORS[kind](bars, j);
        const e = bj.evidence[kind];
        if (!e?.dir) continue;
        const atLevel = Boolean(levelNear(bj, e.price, bj.c));
        votes[e.dir].set(kind, (votes[e.dir].get(kind) ?? false) || atLevel);
      }
    }
    for (const dir of ["up", "down"]) {
      const kinds = [...votes[dir].keys()];
      if (kinds.length >= P.confluenceMin && [...votes[dir].values()].some(Boolean))
        return { dir, price: bars[i].c, note: kinds.map((k) => SIGNALS[k].name).join(" + ") };
    }
    return null;
  },

  absorptionLevel(bars, i) {
    const e = DETECTORS.absorption(bars, i);
    const L = e && levelNear(bars[i], e.price, bars[i].c);
    return L ? { ...e, level: L.name, note: `${L.name} ${Math.round(L.price)}：${e.note}` } : null;
  },

  // A poke past a previous-day level that closes back on the side it came from.
  sweepLevel(bars, i) {
    if (i < 2) return null;
    const b = bars[i];
    for (const L of b.keyLevels) {
      for (const j of [i, i - 1]) {
        const s = bars[j];
        const before = bars[j - 1];
        const backBelow = j === i ? b.c < L.price : bars[i - 1].c >= L.price && b.c < L.price;
        const backAbove = j === i ? b.c > L.price : bars[i - 1].c <= L.price && b.c > L.price;
        if (before.c < L.price && s.h > L.price && s.h <= L.price * (1 + P.sweepMaxPct) && backBelow)
          return { dir: "down", price: L.price, level: L.name, note: `刺穿${L.name} ${Math.round(L.price)} 後收回` };
        if (before.c > L.price && s.l < L.price && s.l >= L.price * (1 - P.sweepMaxPct) && backAbove)
          return { dir: "up", price: L.price, level: L.name, note: `跌破${L.name} ${Math.round(L.price)} 後收回` };
      }
    }
    return null;
  },

  divergenceLevel(bars, i) {
    const e = DETECTORS.divergence(bars, i);
    const L = e && levelNear(bars[i], e.price, bars[i].c);
    return L ? { ...e, level: L.name, note: `${L.name} ${Math.round(L.price)}：${e.note}` } : null;
  },

  // A new price extreme that cumulative delta does not confirm.
  divergence(bars, i) {
    if (i < P.swingLookback) return null;
    const b = bars[i];
    const window = bars.slice(i - P.swingLookback, i - 2);
    const top = window.reduce((a, x) => (x.h > a.h ? x : a));
    const bottom = window.reduce((a, x) => (x.l < a.l ? x : a));
    if (b.h > hi(bars, i - P.swingLookback, i) && b.cvd < top.cvd)
      return { dir: "down", price: b.h, note: `價格高於前高 ${top.h}，CVD 低於當時` };
    if (b.l < lo(bars, i - P.swingLookback, i) && b.cvd > bottom.cvd)
      return { dir: "up", price: b.l, note: `價格低於前低 ${bottom.l}，CVD 高於當時` };
    return null;
  },

  // A close outside the recent range on unusual volume with delta behind it.
  breakout(bars, i) {
    if (i < P.statsWindow) return null;
    const b = bars[i];
    const z = zScore(b.volume, bars.slice(i - P.statsWindow, i).map((x) => x.volume));
    if (z < P.breakoutVolumeZ) return null;
    const top = hi(bars, i - P.swingLookback, i);
    const bottom = lo(bars, i - P.swingLookback, i);
    if (b.c > top && b.delta > 0) return { dir: "up", price: top, note: `收在區間高點 ${top} 之上，量 z=${z.toFixed(1)}` };
    if (b.c < bottom && b.delta < 0) return { dir: "down", price: bottom, note: `收在區間低點 ${bottom} 之下，量 z=${z.toFixed(1)}` };
    return null;
  },

  // Unusual 5-minute change in open interest, read together with price.
  oi(bars, i) {
    const b = bars[i];
    const prev = bars[i - 1];
    if (!prev || b.oi == null || prev.oi == null || i < 60) return null;
    const changes = [];
    for (let k = Math.max(1, i - P.oiWindow); k < i; k++)
      if (bars[k].oi != null && bars[k - 1].oi != null) changes.push(bars[k].oi - bars[k - 1].oi);
    const d = b.oi - prev.oi;
    const z = zScore(d, changes);
    if (Math.abs(z) < P.oiZ) return null;
    const up = b.c >= b.o;
    const kind = d > 0 ? (up ? "新多進場" : "新空進場") : up ? "空單回補" : "多單平倉";
    // Context only: new positions or closures do not imply a direction on their own.
    return { dir: null, price: b.c, note: `${kind}：OI ${d > 0 ? "+" : ""}${d.toFixed(0)} BTC（z=${z.toFixed(1)}）` };
  },
};

/** Runs every detector over closed bars; returns events sorted by time. */
export function detect(bars, kinds = DEFAULT_KINDS) {
  const events = [];
  const last = {};
  for (let i = 1; i < bars.length; i++) {
    for (const kind of kinds) {
      const e = DETECTORS[kind](bars, i);
      if (!e) continue;
      const key = `${kind}:${e.dir}`;
      if (last[key] != null && i - last[key] < P.cooldownBars) continue;
      last[key] = i;
      events.push({ t: bars[i].end, i, kind, ...e });
    }
  }
  return events;
}
