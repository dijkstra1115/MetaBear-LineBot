// The whole film is one continuous world drawn from timeline time t (seconds): an S&P 500 line replayed
// on a beat-locked clock in front of a 3D wall of the era's largest companies, with strikes on the biggest days.
// A camera rig yaws, tilts and pushes both planes to the music. renderAt(t) is pure.
(() => {
  "use strict";
  const S = window.SPX;
  const W = 1080;
  const H = 1920;
  const P = 60 / 129.96; // one beat of BARRETE
  const B = (b) => b * P;
  const N = S.c.length;
  const FIRST = S.first;
  const LAST = N - 1;
  const C = S.c;
  const MA = S.ma;
  const DAY = S.day;

  const UP = "#ff3b4a";
  const DN = "#1fe08f";
  const GOLD = "#ffc94d";

  // ------------------------------------------------------------------ data
  const LOG = new Float64Array(N);
  const LMA = new Float64Array(N);
  const HI = new Float64Array(N);
  const HIIDX = new Int32Array(N);
  {
    let hv = S.peak0;
    let hi = -1;
    for (let i = 0; i < N; i++) {
      LOG[i] = Math.log(C[i]);
      LMA[i] = Math.log(MA[i]);
      if (C[i] > hv) {
        hv = C[i];
        hi = i;
      }
      HI[i] = hv;
      HIIDX[i] = hi;
    }
  }
  const RET = (i) => (i > 0 ? C[i] / C[i - 1] - 1 : 0);
  // The two outro views, as the day starts (previous close), matching data.py's ma and dd.
  const DEV = new Float64Array(N);
  const DDP = new Float64Array(N);
  for (let i = 1; i < N; i++) {
    DEV[i] = C[i - 1] / MA[i] - 1;
    DDP[i] = C[i - 1] / HI[i - 1] - 1;
  }
  const D0 = Date.UTC(1949, 0, 1);
  const pad = (n) => String(n).padStart(2, "0");
  const YMD = new Int32Array(N * 3);
  for (let i = 0; i < N; i++) {
    const d = new Date(D0 + DAY[i] * 86400000);
    YMD[i * 3] = d.getUTCFullYear();
    YMD[i * 3 + 1] = d.getUTCMonth() + 1;
    YMD[i * 3 + 2] = d.getUTCDate();
  }
  const dstr = (i) => (i < 0 ? S.peak0d : `${YMD[i * 3]}.${pad(YMD[i * 3 + 1])}.${pad(YMD[i * 3 + 2])}`);
  function idxOf(s) {
    const [y, m, d] = s.split("-").map(Number);
    const off = Math.round((Date.UTC(y, m - 1, d) - D0) / 86400000);
    let lo = 0;
    let hi = N - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (DAY[mid] < off) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  }
  const yearEnd = {};
  const yearStart = {};
  for (let i = FIRST; i < N; i++) {
    const y = YMD[i * 3];
    if (yearStart[y] === undefined) yearStart[y] = i;
    yearEnd[y] = i;
  }
  const prevYearClose = (y) => (y === 1950 ? C[FIRST - 1] : C[yearEnd[y - 1]]);
  const YEARS = S.years.map((r) => r.y);
  const Y0 = YEARS[0];

  // ------------------------------------------------------------------ hashing (seeded, no Math.random)
  function hash(n) {
    let x = (n | 0) ^ 0x9e3779b9;
    x = Math.imul(x ^ (x >>> 16), 0x85ebca6b);
    x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35);
    x ^= x >>> 16;
    return (x >>> 0) / 4294967296;
  }
  const h2 = (a, b) => hash(Math.imul(a, 73856093) ^ Math.imul(b + 1, 19349663));
  const h3 = (a, b, c) => hash(Math.imul(a, 73856093) ^ Math.imul(b + 1, 19349663) ^ Math.imul(c + 7, 83492791));

  const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
  const lerp = (a, b, k) => a + (b - a) * k;
  const smooth = (k) => k * k * (3 - 2 * k);
  const ramp = (t, a, b) => clamp((t - a) / (b - a), 0, 1);
  const win = (t, a, b, fi = 0.15, fo = 0.15) => Math.min(ramp(t, a, a + fi), 1 - ramp(t, b - fo, b));
  const expo = (k) => 1 - Math.pow(1 - k, 3);

  // ------------------------------------------------------------------ the clock: beat -> trading day
  // Every strike date sits on a key, so each lands on the beat it is written against.
  const KEYS = [
    [-1, "2025-04-03"], [-0.25, "2025-04-04"], [1.2, "2025-04-07"], [2.2, "2025-04-08"], [3, "2025-04-09"], [14, "2025-04-09"],
    [22, "1950-01-03"], [24, "1950-01-03"],
    [28, "1955-09-26"], [31, "1962-05-28"], [36, "1970-05-26"], [38, "1974-10-03"], [44, "1986-12-31"],
    [48, "1987-08-25"], [53, "1987-10-19"], [54, "1987-10-20"], [55, "1987-10-21"], [55.5, "1987-10-26"],
    [57, "1988-01-08"], [59, "1989-10-13"], [62, "1997-10-27"], [63, "1998-08-31"], [68, "2000-03-24"],
    [76, "2002-07-24"], [79, "2002-07-29"], [88, "2007-10-09"],
    [104, "2008-09-26"], [108, "2008-09-29"], [111, "2008-09-30"], [116, "2008-10-09"], [118, "2008-10-10"],
    [120, "2008-10-13"], [122, "2008-10-15"], [123, "2008-10-22"], [124, "2008-10-28"], [125.5, "2008-11-13"],
    [126, "2008-11-19"], [126.5, "2008-11-20"], [127, "2008-11-21"], [128, "2008-11-24"], [129, "2008-12-01"],
    [130, "2008-12-16"], [132, "2009-03-10"], [133, "2009-03-23"], [135, "2011-08-08"], [140, "2020-02-19"],
    [142, "2020-03-09"], [143, "2020-03-12"], [144, "2020-03-13"], [145, "2020-03-16"], [146, "2020-03-17"],
    [148, "2020-03-24"], [149, "2020-03-26"], [151, "2020-04-06"], [156, "2022-01-03"], [160, "2022-11-10"],
    [170, "2025-02-19"], [171, "2025-04-03"], [172, "2025-04-04"], [174, "2025-04-08"], [176, "2025-04-09"],
    [180, "2026-11-23"],
  ];
  const KT = KEYS.map((k) => B(k[0]));
  const KV = KEYS.map((k) => idxOf(k[1]));
  // Fritsch-Carlson monotone cubic: no overshoot past a strike date, flat where the clock holds.
  const KM = (() => {
    const n = KT.length;
    const d = [];
    for (let i = 0; i < n - 1; i++) d.push((KV[i + 1] - KV[i]) / (KT[i + 1] - KT[i]));
    const m = new Array(n).fill(0);
    m[0] = 0;
    m[n - 1] = 0;
    for (let i = 1; i < n - 1; i++) {
      if (d[i - 1] * d[i] <= 0) m[i] = 0;
      else {
        const w1 = 2 * (KT[i + 1] - KT[i]) + (KT[i] - KT[i - 1]);
        const w2 = (KT[i + 1] - KT[i]) + 2 * (KT[i] - KT[i - 1]);
        m[i] = (w1 + w2) / (w1 / d[i - 1] + w2 / d[i]);
      }
    }
    return m;
  })();
  function headAt(t) {
    if (t <= KT[0]) return KV[0];
    const n = KT.length;
    if (t >= KT[n - 1]) return KV[n - 1];
    let k = 0;
    while (KT[k + 1] < t) k++;
    const h = KT[k + 1] - KT[k];
    const s = (t - KT[k]) / h;
    const s2 = s * s;
    const s3 = s2 * s;
    return (2 * s3 - 3 * s2 + 1) * KV[k] + (s3 - 2 * s2 + s) * h * KM[k] + (-2 * s3 + 3 * s2) * KV[k + 1] + (s3 - s2) * h * KM[k + 1];
  }

  // Visible span in trading days, eased in log space. FULL = everything since 1950.
  const FULL = -1;
  const SPAN = [
    [0, 90], [3, 90], [14, 110], [16, 500], [19, 6000], [22, 3000], [24, 1800], [44, 2600], [47, 520], [52, 150],
    [55.5, 150], [57, 600], [62, 1800], [68, 1200], [74, 500], [80, 520], [85, 1500], [88, 1000], [100, 450],
    [108, 120], [120, 110], [123, 160], [130, 240], [133, 330], [136, 2000], [139, 1500], [141, 140], [151, 160],
    [154, 600], [158, 450], [162, 520], [167, 700], [171, 140], [176, 140], [178, 400], [180, 480], [183.5, FULL],
  ];
  function keyed(keys, t, map = (v) => v) {
    if (t <= B(keys[0][0])) return map(keys[0][1], t);
    for (let k = 0; k < keys.length - 1; k++) {
      const a = B(keys[k][0]);
      const b = B(keys[k + 1][0]);
      if (t < b) {
        const s = smooth((t - a) / (b - a));
        return [map(keys[k][1], t), map(keys[k + 1][1], t), s];
      }
    }
    return map(keys[keys.length - 1][1], t);
  }
  function spanAt(t, hd) {
    const full = Math.max(hd - FIRST, 50);
    const v = keyed(SPAN, t, (x) => (x === FULL ? full : x));
    if (!Array.isArray(v)) return v;
    return Math.exp(lerp(Math.log(v[0]), Math.log(v[1]), v[2]));
  }
  // Screen geometry of the chart: [head x, left x, top y, bottom y].
  const GEO = [[0, [760, -30, 890, 1520]], [180, [760, -30, 890, 1520]], [183.5, [1010, 70, 830, 1170]]];
  function geoAt(t) {
    const v = keyed(GEO, t);
    if (!Array.isArray(v[0])) return v;
    return v[0].map((a, k) => lerp(a, v[1][k], v[2]));
  }

  // Camera: yaw (deg, turning around the vertical), pitch of the wall (deg) and push (px toward the lens).
  const CAM = [
    [0, [-14, 50, 0]], [6.6, [-8, 50, 70]], [14, [-8, 50, 70]], [17, [22, 46, -80]], [22, [26, 46, -120]],
    [24, [-12, 52, 0]], [44, [-4, 52, 0]], [53, [10, 50, 50]], [56, [4, 52, 0]], [68, [-10, 54, 0]],
    [80, [6, 52, 30]], [88, [-6, 50, 0]], [104, [16, 44, 120]], [118, [18, 42, 170]], [120, [-14, 54, -40]],
    [136, [8, 52, 0]], [140, [-10, 52, 0]], [151, [12, 50, 50]], [154, [0, 52, 0]], [158, [-10, 52, 0]],
    [170, [8, 52, 30]], [176, [-8, 54, 0]], [180, [0, 56, 0]], [184, [0, 62, -380]],
  ];
  function camAt(t) {
    const v = keyed(CAM, t);
    const base = Array.isArray(v[0]) ? v[0].map((a, k) => lerp(a, v[1][k], v[2])) : v;
    const calm = 1 - ramp(t, B(180), B(183));
    return {
      yaw: base[0] + calm * (3.2 * Math.sin(t * 0.52) + 1.4 * Math.sin(t * 1.31 + 1)),
      pitch: base[1] + calm * 1.6 * Math.sin(t * 0.37 + 2),
      z: base[2],
      calm,
    };
  }

  // ------------------------------------------------------------------ events
  const NOTE = {
    "2025-04-04": { sub: "對等關稅衝擊" },
    "2025-04-09": { sub: "關稅暫停 90 天" },
    "1955-09-26": { sub: "艾森豪心臟病發" },
    "1962-05-28": { sub: "1962 閃崩" },
    "1987-10-19": { sub: "黑色星期一", ctx: "1950 年以來最大單日跌幅" },
    "1987-10-20": { sub: "黑色星期一隔天" },
    "1987-10-21": { sub: "崩盤後第 2 天" },
    "1987-10-26": { sub: "再跌一次" },
    "1989-10-13": { sub: "迷你崩盤" },
    "1997-10-27": { sub: "亞洲金融風暴" },
    "1998-08-31": { sub: "俄羅斯違約" },
    "2002-07-24": { sub: "網路泡沫破裂" },
    "2002-07-29": { sub: "網路泡沫破裂" },
    "2008-09-29": { sub: "國會否決紓困案" },
    "2008-09-30": { sub: "隔天就反彈" },
    "2008-10-09": { sub: "金融海嘯" },
    "2008-10-13": { sub: "金融海嘯", ctx: "1950 年以來最大單日漲幅" },
    "2008-10-15": { sub: "兩天後" },
    "2008-10-28": { sub: "金融海嘯" },
    "2009-03-10": { sub: "谷底隔天" },
    "2009-03-23": { sub: "金融海嘯" },
    "2011-08-08": { sub: "美債降評" },
    "2020-03-09": { sub: "COVID-19 · 熔斷" },
    "2020-03-12": { sub: "熔斷" },
    "2020-03-13": { sub: "COVID-19" },
    "2020-03-16": { sub: "熔斷" },
    "2020-03-17": { sub: "熔斷隔天" },
    "2020-03-24": { sub: "COVID-19" },
    "2020-04-06": { sub: "COVID-19" },
    "2022-11-10": { sub: "CPI 低於預期" },
  };
  const MARKS = {
    "2000-03-24": "網路泡沫高點",
    "2007-10-09": "歷史新高",
    "2009-03-09": "谷底",
    "2020-02-19": "歷史新高",
    "2022-01-03": "歷史新高",
    "2025-02-19": "歷史新高",
  };
  const iso = (i) => `${YMD[i * 3]}-${pad(YMD[i * 3 + 1])}-${pad(YMD[i * 3 + 2])}`;

  // Crossing times of the clock: a coarse scan, then bisection.
  const STEP = 1 / 240;
  const T_END = 97.5;
  const SAMPLES = [];
  for (let t = -0.6; t <= T_END; t += STEP) SAMPLES.push([t, headAt(t)]);
  function crossings(i, from, to) {
    for (let k = 1; k < SAMPLES.length; k++) {
      const [ta, va] = SAMPLES[k - 1];
      const [tb, vb] = SAMPLES[k];
      if (tb < from || ta > to) continue;
      if (va < i && vb >= i) {
        let lo = ta;
        let hi = tb;
        for (let r = 0; r < 24; r++) {
          const mid = (lo + hi) / 2;
          if (headAt(mid) >= i) hi = mid;
          else lo = mid;
        }
        return hi;
      }
    }
    return null;
  }
  const ERA_EV = [];
  {
    const eraAt = (v) => {
      const i = Math.round(v);
      return i >= idxOf("2010-01-01") ? 2 : i >= idxOf("1990-01-01") ? 1 : 0;
    };
    let prev = eraAt(SAMPLES[0][1]);
    for (const [t, v] of SAMPLES) {
      const e = eraAt(v);
      if (e !== prev) {
        ERA_EV.push({ t, from: prev, to: e });
        prev = e;
      }
    }
  }
  const HOOK = [-0.6, B(13)];
  const REPLAY = [B(23.5), T_END];
  const topSet = new Map(S.top.map((r) => [r.i, r]));
  const worstSet = new Map(S.worst.map((r) => [r.i, r]));
  const EV = [];
  let evId = 0;
  function addEvent(i, kind, extra) {
    for (const [pass, range] of [["hook", HOOK], ["replay", REPLAY]]) {
      const t0 = crossings(i, range[0], range[1]);
      if (t0 === null) continue;
      if (pass === "hook" && kind !== "up" && kind !== "down") continue;
      const r = RET(i);
      const a = Math.abs(r);
      const k = kind === "up" ? lerp(0.6, 1.6, clamp((a - 0.05) / 0.066, 0, 1)) : kind === "down" ? lerp(0.6, 2.0, clamp((a - 0.06) / 0.145, 0, 1)) : 0.35;
      EV.push({ id: evId++, i, kind, t: t0, pass, k, ret: r, ...extra });
    }
  }
  for (const r of S.top) addEvent(r.i, "up", { rank: r.rank, dd: r.dd });
  for (const r of S.worst) addEvent(r.i, "down", { rank: r.rank, dd: r.dd });
  for (let i = FIRST; i < N; i++) {
    if (topSet.has(i) || worstSet.has(i)) continue;
    if (Math.abs(RET(i)) >= 0.045) addEvent(i, RET(i) > 0 ? "minorUp" : "minorDown", {});
  }
  EV.sort((a, b) => a.t - b.t);
  const BIG = EV.filter((e) => e.kind === "up" || e.kind === "down");
  const HITS = EV.filter((e) => e.kind === "up" && e.pass === "replay");

  // Bear-market stamps: the close first falls 20% under the running high, once per high.
  const BEAR = [];
  {
    let armed = true;
    for (let i = FIRST; i < N; i++) {
      if (HIIDX[i] === i) armed = true;
      if (armed && C[i] / HI[i] - 1 <= -0.2 && HIIDX[i] >= 0) {
        armed = false;
        const t0 = crossings(i, REPLAY[0], B(179));
        if (t0 !== null) {
          const lv = crossings(Math.min(LAST, i + 90), t0, T_END);
          BEAR.push({ i, t: t0, d: lv === null ? 1.3 : clamp(lv - t0, 0.6, 1.3) });
        }
      }
    }
  }
  const MARKEV = Object.entries(MARKS).map(([d, text]) => {
    const i = idxOf(d);
    return { i, text, t: crossings(i, REPLAY[0], B(179)) ?? crossings(i - 1, REPLAY[0], B(179)) };
  });

  // ------------------------------------------------------------------ DOM
  const $ = (id) => document.getElementById(id);
  const stage = $("stage");
  const bg = $("bg");
  const cv = $("chart");
  const fx = $("fx");
  const ctxB = bg.getContext("2d");
  const ctx = cv.getContext("2d");
  const ctxF = fx.getContext("2d");
  const glow = document.createElement("canvas");
  glow.width = W / 2;
  glow.height = H / 2;
  const ctxG = glow.getContext("2d");

  // grain: four seeded noise tiles
  const GRAIN = [];
  for (let g = 0; g < 4; g++) {
    const c = document.createElement("canvas");
    c.width = 256;
    c.height = 256;
    const cx = c.getContext("2d");
    const img = cx.createImageData(256, 256);
    for (let p = 0; p < 256 * 256; p++) {
      const v = Math.floor(h2(g, p) * 255);
      img.data[p * 4] = v;
      img.data[p * 4 + 1] = v;
      img.data[p * 4 + 2] = v;
      img.data[p * 4 + 3] = 255;
    }
    cx.putImageData(img, 0, 0);
    GRAIN.push(c);
  }

  // company wall: a squarified treemap of decorative weights; the era's companies fill it biggest first
  const COS = window.COS;
  const WALL_W = 1500;
  const WALL_H = 1500;
  const WEIGHTS = [9, 7, 6, 5, 4.5, 4, 3.6, 3.2, 3, 2.8, 2.5, 2.3, 2.1, 2, 1.8, 1.6, 1.5, 1.4, 1.3, 1.2];
  function squarify(weights, w, h) {
    const total = weights.reduce((a, b) => a + b, 0);
    const area = weights.map((v) => (v / total) * w * h);
    const out = new Array(weights.length);
    let rx = 0;
    let ry = 0;
    let rw = w;
    let rh = h;
    let idx = 0;
    const worst = (row) => {
      const sum = row.reduce((a, k) => a + area[k], 0);
      const side = Math.min(rw, rh);
      let mx = 0;
      for (const k of row) mx = Math.max(mx, (side * side * area[k]) / (sum * sum), (sum * sum) / (side * side * area[k]));
      return mx;
    };
    while (idx < area.length) {
      let row = [idx];
      let best = worst(row);
      while (idx + row.length < area.length) {
        const next = row.concat(idx + row.length);
        const wv = worst(next);
        if (wv > best) break;
        row = next;
        best = wv;
      }
      const sum = row.reduce((a, k) => a + area[k], 0);
      if (rw >= rh) {
        const cw = sum / rh;
        let cy = ry;
        for (const k of row) {
          out[k] = [rx, cy, cw, area[k] / cw];
          cy += area[k] / cw;
        }
        rx += cw;
        rw -= cw;
      } else {
        const ch = sum / rw;
        let cx = rx;
        for (const k of row) {
          out[k] = [cx, ry, area[k] / ch, ch];
          cx += area[k] / ch;
        }
        ry += ch;
        rh -= ch;
      }
      idx += row.length;
    }
    return out;
  }
  const wall = $("wall");
  const wallWrap = $("wall-wrap");
  const RECTS = squarify(WEIGHTS, WALL_W, WALL_H);
  const cos = RECTS.map(([x, y, w, h], k) => {
    const el = document.createElement("div");
    el.className = "co";
    el.style.left = `${(x + 6).toFixed(1)}px`;
    el.style.top = `${(y + 6).toFixed(1)}px`;
    el.style.width = `${(w - 12).toFixed(1)}px`;
    el.style.height = `${(h - 12).toFixed(1)}px`;
    el.innerHTML = '<div class="ci"><span class="cw"></span><span class="cz"></span><span class="cp"></span></div>';
    wall.appendChild(el);
    return { el, w: w - 12, h: h - 12, inner: el.querySelector(".ci"), cw: el.querySelector(".cw"), cz: el.querySelector(".cz"), cp: el.querySelector(".cp"), key: "", who: "" };
  });
  const ERA_I = COS.eras.map((e) => idxOf(e.from));
  const eraOf = (i) => (i >= ERA_I[2] ? 2 : i >= ERA_I[1] ? 1 : 0);
  // close of the last full week before day i (no peeking at the rest of the week)
  function coVal(tk, i) {
    const sr = COS.series[tk];
    if (!sr || i < 0) return null;
    const d = DAY[i];
    let w = Math.floor(d / 7);
    if (d % 7 !== 6) w -= 1;
    const k = w - sr.w0;
    if (k < 0) return null;
    return sr.c[Math.min(k, sr.c.length - 1)];
  }

  const hud = {
    wrap: $("hud"),
    price: $("hud-price"),
    date: $("hud-date"),
    ref: $("hud-ref"),
    pct: $("hud-pct"),
    pill: $("hud-pill"),
    wall: $("hud-wall"),
  };
  const panel = $("panel");
  const count = $("panel-count");
  const note = $("panel-note");
  const rows = [0, 1, 2, 3].map((k) => ({
    el: $(`row${k}`),
    rank: $(`row${k}`).querySelector(".rk"),
    date: $(`row${k}`).querySelector(".rd"),
    ret: $(`row${k}`).querySelector(".rr"),
    dd: $(`row${k}`).querySelector(".rdd"),
  }));
  const labs = ["labA", "labB"].map((id) => ({
    el: $(id),
    big: $(id).querySelector(".lb-big"),
    sub: $(id).querySelector(".lb-sub"),
    pill: $(id).querySelector(".lb-pill"),
    ctx: $(id).querySelector(".lb-ctx"),
  }));
  const mark = $("mark");
  const markText = mark.querySelector(".mk-t");
  const markVal = mark.querySelector(".mk-v");
  const stamp = $("stamp");

  // ------------------------------------------------------------------ chart frame
  let G = null; // per-frame geometry
  function rangeAt(t) {
    // the y range smoothed over the last 0.5 s so the scale breathes instead of snapping
    let lo = 0;
    let hi = 0;
    let wsum = 0;
    for (let k = 0; k < 6; k++) {
      const tt = t - k * 0.09;
      const hd = headAt(tt);
      const sp = spanAt(tt, hd);
      const a = Math.max(FIRST, Math.floor(hd - sp));
      const b = Math.min(LAST, Math.ceil(hd));
      const stp = Math.max(1, Math.floor((b - a) / 900));
      let mn = Infinity;
      let mx = -Infinity;
      for (let i = a; i <= b; i += stp) {
        if (LOG[i] < mn) mn = LOG[i];
        if (LOG[i] > mx) mx = LOG[i];
        if (LMA[i] < mn) mn = LMA[i];
      }
      const w = 6 - k;
      lo += mn * w;
      hi += mx * w;
      wsum += w;
    }
    lo /= wsum;
    hi /= wsum;
    const minR = Math.log(1.18);
    if (hi - lo < minR) {
      const m = (hi + lo) / 2;
      lo = m - minR / 2;
      hi = m + minR / 2;
    }
    const pad = (hi - lo) * 0.08;
    return [lo - pad * 1.4, hi + pad];
  }
  function frame(t, look) {
    const hd = headAt(t);
    const sp = spanAt(t, hd);
    const [xh, xl, yt, yb] = geoAt(t);
    const [lo, hi] = rangeAt(t);
    const i1 = Math.min(LAST - 1, Math.floor(hd));
    const fr = hd - i1;
    const hl = lerp(LOG[i1], LOG[i1 + 1], fr);
    const m1 = look.m1;
    const m2 = look.m2;
    const mp = 1 - m1 - m2;
    const span = yb - yt;
    const y = (lv) => yb - ((lv - lo) / (hi - lo)) * span;
    const yDev = (v) => yb - ((v + 0.45) / 0.75) * span; // -45% .. +30% from the 200-day average
    const yDd = (v) => yb - ((v + 0.62) / 0.66) * span; // -62% .. +4% from the high
    G = {
      t, hd, sp, xh, xl, yt, yb, lo, hi, i1, fr, hl, m1, m2, mp, y, yDev, yDd,
      x: (i) => xh - ((hd - i) / sp) * (xh - xl),
      // the price line morphs into the distance from its average (stat 1), then from its high (stat 2)
      yi: (i) => mp * y(LOG[i]) + m1 * yDev(DEV[i]) + m2 * yDd(DDP[i]),
      ym: (i) => mp * y(LMA[i]) + m1 * yDev(0) + m2 * yDd(0),
    };
    return G;
  }

  // ------------------------------------------------------------------ effects envelopes
  function shock(t) {
    let amp = 0;
    let gl = 0;
    let fl = 0;
    let ca = 0;
    let flc = [255, 80, 90];
    for (const e of EV) {
      const dt = t - e.t;
      if (dt < 0 || dt > 1.2) continue;
      const big = e.kind === "up" || e.kind === "down";
      if (!big) continue;
      amp += 12 * e.k * Math.exp(-dt / 0.16);
      if (e.k > 0.95) gl = Math.max(gl, Math.exp(-dt / 0.1) * Math.min(1, e.k - 0.5));
      const f = 0.22 * e.k * Math.exp(-dt / 0.07);
      if (f > fl) {
        fl = f;
        flc = e.kind === "up" ? [255, 70, 80] : [90, 255, 190];
      }
      ca = Math.max(ca, e.k * Math.exp(-dt / 0.22));
    }
    return { amp, gl, fl, flc, ca };
  }

  // ------------------------------------------------------------------ drawing: background
  function drawBg(t, dim) {
    const c = ctxB;
    c.fillStyle = "#040506";
    c.fillRect(0, 0, W, H);
    // vertical light streaks
    c.globalCompositeOperation = "lighter";
    for (let s = 0; s < 14; s++) {
      const x = ((h2(s, 1) * W + t * (6 + 10 * h2(s, 2))) % (W + 200)) - 100;
      const a = (0.03 + 0.05 * h2(s, 3)) * (0.6 + 0.4 * Math.sin(t * (0.3 + h2(s, 4)) + s)) * dim;
      const g = c.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, "rgba(160,190,210,0)");
      g.addColorStop(0.35 + 0.2 * h2(s, 5), `rgba(160,190,210,${a})`);
      g.addColorStop(1, "rgba(160,190,210,0)");
      c.fillStyle = g;
      c.fillRect(x, 0, 1 + 2 * h2(s, 6), H);
    }
    // dust
    for (let p = 0; p < 140; p++) {
      const sp = 8 + 22 * h2(p, 11);
      const x = (h2(p, 12) * W + Math.sin(t * 0.4 + p) * 20) % W;
      const y = (((h2(p, 13) * H - t * sp) % H) + H) % H;
      const a = (0.08 + 0.25 * h2(p, 14)) * dim * (0.5 + 0.5 * Math.sin(t * 1.3 + p * 1.7));
      c.fillStyle = `rgba(220,230,235,${a})`;
      c.fillRect(x, y, 1.6, 1.6);
    }
    c.globalCompositeOperation = "source-over";
    // horizon haze behind the floor
    const hz = c.createRadialGradient(540, 1100, 40, 540, 1100, 900);
    hz.addColorStop(0, `rgba(40,60,60,${0.22 * dim})`);
    hz.addColorStop(1, "rgba(0,0,0,0)");
    c.fillStyle = hz;
    c.fillRect(0, 0, W, H);
  }

  // ------------------------------------------------------------------ drawing: chart
  function pricePaths(g, a, b, stp) {
    const up = new Path2D();
    const dn = new Path2D();
    const L = Math.max(stp, Math.round(g.sp / 140));
    let px = g.x(a);
    let py = g.yi(a);
    for (let i = a + stp; i <= b; i += stp) {
      const x = g.x(i);
      const y = g.yi(i);
      const p = C[i] >= C[Math.max(0, i - L)] ? up : dn;
      p.moveTo(px, py);
      p.lineTo(x, y);
      px = x;
      py = y;
    }
    // the partial day at the head
    const hx = g.x(g.hd);
    const hy = lerp(g.yi(g.i1), g.yi(g.i1 + 1), g.fr);
    const p = g.hl >= LOG[Math.max(0, g.i1 - L + 1)] ? up : dn;
    p.moveTo(px, py);
    p.lineTo(hx, hy);
    return { up, dn, hx, hy, last: p === up };
  }

  function drawChart(t, sh, look) {
    const g = G;
    const c = ctx;
    c.clearRect(0, 0, W, H);
    ctxG.clearRect(0, 0, W / 2, H / 2);
    const a = Math.max(FIRST, Math.floor(g.hd - g.sp) - 1);
    const b = g.i1;
    const stp = Math.max(1, Math.floor((b - a) / 1500));

    // price grid
    c.save();
    c.font = "500 24px 'Barlow Condensed'";
    c.textBaseline = "bottom";
    const span = g.hi - g.lo;
    const raw = Math.exp(g.lo + span * 0.5);
    const mag = Math.pow(10, Math.floor(Math.log10(raw)));
    const steps = [1, 2, 5].map((m) => m * mag).concat([10 * mag, 0.5 * mag, 0.2 * mag]);
    for (let k = 0; k < 4; k++) {
      const lv = g.lo + span * (0.15 + 0.23 * k);
      const v = Math.exp(lv);
      let best = steps[0];
      for (const s of steps) if (Math.abs(Math.round(v / s) * s - v) / v < Math.abs(Math.round(v / best) * best - v) / v) best = s;
      const nv = Math.round(v / best) * best;
      const y = g.y(Math.log(nv));
      c.strokeStyle = `rgba(255,255,255,${0.05 * look.grid})`;
      c.lineWidth = 1;
      c.beginPath();
      c.moveTo(0, y);
      c.lineTo(W, y);
      c.stroke();
      c.fillStyle = `rgba(200,210,215,${0.32 * look.grid})`;
      c.fillText(nv >= 100 ? nv.toFixed(0) : nv.toFixed(1), 22, y - 4);
    }
    c.restore();

    // guides for the two outro views
    if (g.m1 > 0.001 || g.m2 > 0.001) {
      c.save();
      c.font = "700 30px 'Noto Sans TC Sub'";
      c.textBaseline = "bottom";
      c.lineWidth = 8;
      c.lineJoin = "round";
      c.strokeStyle = "rgba(3,5,6,0.85)";
      const say = (txt, x, y) => {
        c.strokeText(txt, x, y);
        c.fillText(txt, x, y);
      };
      if (g.m1 > 0.001) {
        const y0 = g.yDev(0);
        c.fillStyle = `rgba(31,224,143,${0.08 * g.m1})`;
        c.fillRect(g.xl, y0, g.xh - g.xl, g.yb - y0 + 20);
        c.fillStyle = `rgba(255,201,77,${g.m1})`;
        
        c.fillStyle = `rgba(160,240,205,${0.8 * g.m1})`;
        c.font = "700 26px 'Noto Sans TC Sub'";
        
      }
      if (g.m2 > 0.001) {
        const y0 = g.yDd(0);
        const y20 = g.yDd(-0.2);
        c.font = "700 30px 'Noto Sans TC Sub'";
        c.fillStyle = `rgba(31,224,143,${0.1 * g.m2})`;
        c.fillRect(g.xl, y20, g.xh - g.xl, g.yb - y20 + 20);
        c.fillStyle = `rgba(255,201,77,${g.m2})`;
        
        c.save();
        c.strokeStyle = `rgba(255,201,77,${0.9 * g.m2})`;
        c.lineWidth = 2.5;
        c.setLineDash([10, 8]);
        c.beginPath();
        c.moveTo(g.xl, y20);
        c.lineTo(g.xh, y20);
        c.stroke();
        c.restore();
        
        c.fillStyle = `rgba(160,240,205,${0.8 * g.m2})`;
        c.font = "900 30px 'Noto Sans TC Sub'";
        
      }
      c.restore();
    }

    // 200-day average (gold: the thing nobody sees on a price chart)
    if (look.ma > 0) {
      c.save();
      c.beginPath();
      for (let i = a; i <= b; i += stp) {
        const x = g.x(i);
        const y = g.ym(i);
        if (i === a) c.moveTo(x, y);
        else c.lineTo(x, y);
      }
      c.strokeStyle = `rgba(255,201,77,${0.55 * look.ma})`;
      c.lineWidth = 2 + 1.5 * look.maHi;
      c.setLineDash([]);
      c.stroke();
      if (look.maHi > 0) {
        ctxG.save();
        ctxG.scale(0.5, 0.5);
        ctxG.strokeStyle = `rgba(255,201,77,${0.7 * look.maHi})`;
        ctxG.lineWidth = 12;
        ctxG.stroke(new Path2D(pathOf(a, b, stp, LMA)));
        ctxG.restore();
      }
      c.restore();
    }

    // running high and the drawdown bracket
    const hiNow = HI[g.i1];
    const dd = Math.exp(g.hl) / hiNow - 1;
    const ph = pricePaths(g, a, b, stp);
    if (look.hi > 0 && dd < -0.04) {
      const k = clamp((-dd - 0.04) / 0.06, 0, 1) * look.hi;
      let yH = g.y(Math.log(hiNow));
      const clipped = yH < g.yt - 120;
      yH = Math.max(yH, g.yt - 120);
      const xPk = HIIDX[g.i1] >= 0 ? Math.max(g.xl, g.x(HIIDX[g.i1])) : g.xl;
      c.save();
      c.strokeStyle = `rgba(255,201,77,${0.5 * k})`;
      c.setLineDash([10, 9]);
      c.lineWidth = 2;
      c.beginPath();
      c.moveTo(clipped ? g.xl : xPk, yH);
      c.lineTo(ph.hx + 70, yH);
      c.stroke();
      c.setLineDash([]);
      // bracket
      const bx = ph.hx + 46;
      c.strokeStyle = `rgba(255,201,77,${0.9 * k})`;
      c.lineWidth = 3;
      c.beginPath();
      c.moveTo(bx - 12, yH);
      c.lineTo(bx, yH);
      c.lineTo(bx, ph.hy);
      c.lineTo(bx - 12, ph.hy);
      c.stroke();
      if (clipped) {
        c.beginPath();
        c.moveTo(bx - 9, yH + 12);
        c.lineTo(bx, yH);
        c.lineTo(bx + 9, yH + 12);
        c.stroke();
      }
      c.font = "700 34px 'Barlow Condensed'";
      c.fillStyle = `rgba(255,201,77,${k})`;
      c.textBaseline = "middle";
      c.fillText(`${(dd * 100).toFixed(1).replace("-", "−")}%`, bx + 12, (yH + ph.hy) / 2);
      c.restore();
    }

    // price line: chroma copies, glow, core
    const caPx = 1 + 7 * sh.ca + 10 * look.rewind;
    const caA = Math.min(1, 0.35 + 0.65 * Math.max(sh.ca, look.rewind));
    c.save();
    c.lineCap = "round";
    c.lineJoin = "round";
    c.globalCompositeOperation = "lighter";
    c.lineWidth = 3;
    c.translate(-caPx, 0);
    c.strokeStyle = `rgba(255,0,60,${0.4 * caA})`;
    c.stroke(ph.up);
    c.stroke(ph.dn);
    c.translate(caPx * 2, 0);
    c.strokeStyle = `rgba(0,200,255,${0.32 * caA})`;
    c.stroke(ph.up);
    c.stroke(ph.dn);
    c.restore();
    // rewind smear: ghost copies trailing to the right
    if (look.rewind > 0) {
      c.save();
      c.globalCompositeOperation = "lighter";
      c.lineWidth = 2;
      for (let s = 1; s <= 5; s++) {
        c.translate(18 * look.rewind, 0);
        c.globalAlpha = 0.28 * look.rewind * (1 - s / 6);
        c.strokeStyle = UP;
        c.stroke(ph.up);
        c.strokeStyle = DN;
        c.stroke(ph.dn);
      }
      c.restore();
    }
    c.save();
    c.lineCap = "round";
    c.lineJoin = "round";
    c.lineWidth = 3.2;
    c.strokeStyle = UP;
    c.stroke(ph.up);
    c.strokeStyle = DN;
    c.stroke(ph.dn);
    c.restore();
    ctxG.save();
    ctxG.scale(0.5, 0.5);
    ctxG.lineCap = "round";
    ctxG.lineWidth = 9;
    ctxG.globalAlpha = 0.75;
    ctxG.strokeStyle = UP;
    ctxG.stroke(ph.up);
    ctxG.strokeStyle = DN;
    ctxG.stroke(ph.dn);
    ctxG.restore();

    // outro markers: every top day as a red pin, worst days as green pins
    if (look.pins > 0) {
      drawPins(g, look);
      drawGuideText(g);
    }

    // head
    const hc = ph.last ? [255, 59, 74] : [31, 224, 143];
    const hr = 70 + 30 * sh.ca;
    const rg = c.createRadialGradient(ph.hx, ph.hy, 0, ph.hx, ph.hy, hr);
    rg.addColorStop(0, `rgba(255,255,255,${0.95 * look.head})`);
    rg.addColorStop(0.12, `rgba(${hc},${0.85 * look.head})`);
    rg.addColorStop(1, `rgba(${hc},0)`);
    c.save();
    c.globalCompositeOperation = "lighter";
    c.fillStyle = rg;
    c.fillRect(ph.hx - hr, ph.hy - hr, hr * 2, hr * 2);
    const ls = c.createLinearGradient(ph.hx - 260, 0, ph.hx + 260, 0);
    ls.addColorStop(0, `rgba(${hc},0)`);
    ls.addColorStop(0.5, `rgba(255,255,255,${0.5 * look.head})`);
    ls.addColorStop(1, `rgba(${hc},0)`);
    c.fillStyle = ls;
    c.fillRect(ph.hx - 260, ph.hy - 1.5, 520, 3);
    c.restore();
    ctxG.fillStyle = `rgba(${hc},${0.9 * look.head})`;
    ctxG.beginPath();
    ctxG.arc(ph.hx / 2, ph.hy / 2, 9, 0, Math.PI * 2);
    ctxG.fill();

    drawStrikes(t, g, ph);
    drawCharge(t, ph);

    // bloom
    c.save();
    c.globalCompositeOperation = "lighter";
    c.filter = "blur(5px)";
    c.globalAlpha = 0.9;
    c.drawImage(glow, 0, 0, W, H);
    c.filter = "blur(22px)";
    c.globalAlpha = 0.8;
    c.drawImage(glow, 0, 0, W, H);
    c.restore();

    // glitch slices
    const gl = Math.max(sh.gl, look.rewind * 0.7, look.glitch);
    if (gl > 0.04) {
      const f = Math.floor(t * 30);
      const n = 5 + Math.floor(12 * gl);
      for (let s = 0; s < n; s++) {
        const y = h3(f, s, 1) * H;
        const hh = 6 + h3(f, s, 2) * 70;
        const dx = (h3(f, s, 3) - 0.5) * 140 * gl;
        c.drawImage(cv, 0, y, W, hh, dx, y, W, hh);
      }
    }
    return ph;
  }
  function pathOf(a, b, stp, arr) {
    let d = "";
    for (let i = a; i <= b; i += stp) d += `${i === a ? "M" : "L"}${G.x(i).toFixed(1)} ${(arr === LMA ? G.ym(i) : G.y(arr[i])).toFixed(1)}`;
    return d;
  }

  const CLUSTERS = (() => {
    const ys = S.top.map((r) => ({ y: Number(r.d.slice(0, 4)), i: r.i })).sort((p, q) => p.i - q.i);
    const out = [];
    for (const r of ys) {
      const last = out[out.length - 1];
      if (last && r.y - last.y1 <= 1) {
        last.y1 = r.y;
        last.n++;
        last.i1 = r.i;
      } else out.push({ y0: r.y, y1: r.y, n: 1, i0: r.i, i1: r.i });
    }
    return out.map((k) => ({ ...k, text: `${k.y0}${k.y1 > k.y0 ? `–${String(k.y1).slice(2)}` : ""} ×${k.n}` }));
  })();
  function drawAxis(g, look) {
    const c = ctx;
    const k = look.pins;
    c.save();
    c.font = "500 26px 'Barlow Condensed'";
    c.textAlign = "center";
    c.fillStyle = `rgba(200,210,215,${0.55 * k})`;
    for (const yr of [1950, 1970, 1990, 2010]) {
      const x = g.x(yearStart[yr]);
      c.fillText(String(yr), x, g.yb + 46);
      c.fillRect(x - 0.5, g.yb + 8, 1, 10);
    }
    // cluster tags in one row above the chart, leaders down to each cluster's tallest pin
    const tagK = ramp(G.t, B(193.5), B(195)) * g.mp * (1 - ramp(G.t, B(199.5), B(200.5)));
    if (tagK > 0) {
      c.font = "700 32px 'Barlow Condensed'";
      const want = CLUSTERS.map((cl) => {
        let top = Infinity;
        for (const r of S.top) if (r.i >= cl.i0 && r.i <= cl.i1) top = Math.min(top, g.yi(r.i) - 150);
        return { cl, cx: (g.x(cl.i0) + g.x(cl.i1)) / 2, top };
      });
      const xs = want.map((w) => w.cx);
      for (let k = xs.length - 1; k >= 0; k--) xs[k] = Math.min(xs[k], k === xs.length - 1 ? 1000 : xs[k + 1] - 136);
      const rowY = g.yt - 34;
      want.forEach((w, k) => {
        c.strokeStyle = `rgba(255,201,77,${0.5 * tagK})`;
        c.lineWidth = 1.5;
        c.beginPath();
        c.moveTo(xs[k], rowY + 8);
        c.lineTo(w.cx, Math.max(rowY + 20, w.top - 6));
        c.stroke();
        c.fillStyle = `rgba(255,201,77,${tagK})`;
        c.fillText(w.cl.text, xs[k], rowY);
      });
    }
    c.restore();
  }
  function drawGuideText(g) {
    if (g.m1 <= 0.001 && g.m2 <= 0.001) return;
    const c = ctx;
    c.save();
    c.textBaseline = "bottom";
    c.lineWidth = 8;
    c.lineJoin = "round";
    c.strokeStyle = "rgba(3,5,6,0.85)";
    const say = (txt, x, y, font, col) => {
      c.font = font;
      c.fillStyle = col;
      c.strokeText(txt, x, y);
      c.fillText(txt, x, y);
    };
    if (g.m1 > 0.001) {
      say("200 日均線", g.xl, g.yDev(0) - 10, "700 30px 'Noto Sans TC Sub'", `rgba(255,201,77,${g.m1})`);
      say("均線之下", g.xl, g.yb + 14, "700 28px 'Noto Sans TC Sub'", `rgba(160,240,205,${0.85 * g.m1})`);
    }
    if (g.m2 > 0.001) {
      say("歷史高點", g.xl, g.yDd(0) - 10, "700 30px 'Noto Sans TC Sub'", `rgba(255,201,77,${g.m2})`);
      say("距高點 −20%", g.xl, g.yDd(-0.2) - 10, "700 30px 'Noto Sans TC Sub'", `rgba(255,201,77,${g.m2})`);
      say("熊市", g.xl, g.yb + 14, "900 30px 'Noto Sans TC Sub'", `rgba(160,240,205,${0.85 * g.m2})`);
    }
    c.restore();
  }
  function drawPins(g, look) {
    const c = ctx;
    drawAxis(g, look);
    c.save();
    c.globalCompositeOperation = "lighter";
    for (const r of S.top) {
      const x = g.x(r.i);
      const y = g.yi(r.i);
      const k = look.pins;
      const lg = c.createLinearGradient(0, y - 150, 0, y);
      lg.addColorStop(0, "rgba(255,59,74,0)");
      lg.addColorStop(1, `rgba(255,59,74,${0.85 * k * g.mp})`);
      c.fillStyle = lg;
      c.fillRect(x - 1.5, y - 150, 3, 150);
      c.fillStyle = `rgba(255,220,220,${k})`;
      c.beginPath();
      c.arc(x, y, 4.5 + 2.5 * (1 - g.mp), 0, Math.PI * 2);
      c.fill();
      if (r.dd > -20 && g.m2 > 0.001) {
        c.strokeStyle = `rgba(255,201,77,${g.m2})`;
        c.lineWidth = 3;
        c.beginPath();
        c.arc(x, y, 17, 0, Math.PI * 2);
        c.stroke();
        c.save();
        c.globalCompositeOperation = "source-over";
        c.font = "700 30px 'Barlow Condensed'";
        c.textAlign = "right";
        c.fillStyle = `rgba(255,201,77,${g.m2})`;
        c.lineWidth = 8;
        c.lineJoin = "round";
        c.strokeStyle = `rgba(3,5,6,${0.85 * g.m2})`;
        c.strokeText(`${r.d}  ${r.dd.toFixed(1).replace("-", "−")}%`, x - 26, y - 22);
        c.fillText(`${r.d}  ${r.dd.toFixed(1).replace("-", "−")}%`, x - 26, y - 22);
        c.restore();
      }
      ctxG.fillStyle = `rgba(255,59,74,${0.9 * k})`;
      ctxG.beginPath();
      ctxG.arc(x / 2, y / 2, 8, 0, Math.PI * 2);
      ctxG.fill();
    }
    if (look.worst > 0) {
      for (const r of S.worst) {
        const x = g.x(r.i);
        const y = g.yi(r.i);
        const k = look.worst * g.mp;
        const lg = c.createLinearGradient(0, y, 0, y + 130);
        lg.addColorStop(0, `rgba(31,224,143,${0.85 * k})`);
        lg.addColorStop(1, "rgba(31,224,143,0)");
        c.fillStyle = lg;
        c.fillRect(x - 1.5, y, 3, 130);
        c.fillStyle = `rgba(210,255,235,${k})`;
        c.beginPath();
        c.arc(x, y, 4, 0, Math.PI * 2);
        c.fill();
      }
    }
    c.restore();
  }

  // lightning: midpoint displacement, seeded per flicker step
  function bolt(x0, y0, x1, y1, seed, rough, depth) {
    let pts = [[x0, y0], [x1, y1]];
    let amp = Math.hypot(x1 - x0, y1 - y0) * rough;
    for (let d = 0; d < depth; d++) {
      const nx = [];
      for (let p = 0; p < pts.length - 1; p++) {
        const [ax, ay] = pts[p];
        const [bx, by] = pts[p + 1];
        const mx = (ax + bx) / 2;
        const my = (ay + by) / 2;
        const len = Math.hypot(bx - ax, by - ay) || 1;
        const off = (h3(seed, d, p) - 0.5) * amp;
        nx.push([ax, ay], [mx + (-(by - ay) / len) * off, my + ((bx - ax) / len) * off]);
      }
      nx.push(pts[pts.length - 1]);
      pts = nx;
      amp *= 0.55;
    }
    return pts;
  }
  function strokePts(c, pts, scale) {
    c.beginPath();
    c.moveTo(pts[0][0] * scale, pts[0][1] * scale);
    for (let p = 1; p < pts.length; p++) c.lineTo(pts[p][0] * scale, pts[p][1] * scale);
    c.stroke();
  }

  function sparks(c, cg, e, ox, oy, dt, up, n) {
    const g = 1700;
    const lam = 1.4;
    for (let p = 0; p < n; p++) {
      const life = 0.45 + 0.95 * h3(e.id, p, 1);
      if (dt > life) continue;
      const ang = up ? -Math.PI / 2 + (h3(e.id, p, 2) - 0.5) * Math.PI * 1.35 : -Math.PI / 2 + (h3(e.id, p, 2) - 0.5) * Math.PI * 1.9;
      const spd = (300 + 1150 * Math.pow(h3(e.id, p, 3), 2)) * Math.sqrt(e.k);
      const vx = Math.cos(ang) * spd;
      const vy = Math.sin(ang) * spd;
      const pos = (tt) => {
        const f = (1 - Math.exp(-lam * tt)) / lam;
        return [ox + vx * f, oy + vy * f + 0.5 * g * tt * tt];
      };
      const [x2, y2] = pos(dt);
      const [x1, y1] = pos(Math.max(0, dt - 0.035));
      const a = Math.pow(1 - dt / life, 1.6);
      const hot = 1 - dt / life;
      const col = up ? `rgba(255,${Math.floor(120 + 130 * hot)},${Math.floor(70 + 120 * hot * hot)},${a})` : `rgba(${Math.floor(120 + 135 * hot)},255,${Math.floor(190 + 60 * hot)},${a})`;
      c.strokeStyle = col;
      c.lineWidth = 1.2 + 1.6 * h3(e.id, p, 4);
      c.beginPath();
      c.moveTo(x1, y1);
      c.lineTo(x2, y2);
      c.stroke();
      if (p % 3 === 0) {
        cg.strokeStyle = col;
        cg.lineWidth = 3;
        cg.beginPath();
        cg.moveTo(x1 / 2, y1 / 2);
        cg.lineTo(x2 / 2, y2 / 2);
        cg.stroke();
      }
    }
  }

  function drawStrikes(t, g, ph) {
    const c = ctx;
    c.save();
    c.globalCompositeOperation = "lighter";
    c.lineCap = "round";
    ctxG.save();
    ctxG.globalCompositeOperation = "lighter";
    ctxG.lineCap = "round";
    for (const e of EV) {
      const dt = t - e.t;
      if (dt < 0 || dt > 1.6) continue;
      if (e.pass === "hook" && t > B(13.5)) continue;
      if (e.pass === "replay" && t > B(181.5)) continue;
      const ex = g.x(e.i);
      const ey = g.y(LOG[e.i]);
      if (ex < -200 || ex > W + 200) continue;
      const up = e.kind === "up" || e.kind === "minorUp";
      const minor = e.kind.startsWith("minor");
      const k = e.k;
      if (up) {
        const env = dt < 0.04 ? dt / 0.04 : Math.exp(-(dt - 0.04) / (minor ? 0.18 : 0.34));
        if (env > 0.01) {
          const top = ey - (minor ? 200 : 460) * k;
          const wdt = (minor ? 10 : 30) * k * env + 3;
          const lg = c.createLinearGradient(ex - wdt, 0, ex + wdt, 0);
          lg.addColorStop(0, "rgba(255,40,60,0)");
          lg.addColorStop(0.35, `rgba(255,60,80,${0.55 * env})`);
          lg.addColorStop(0.5, `rgba(255,245,235,${env})`);
          lg.addColorStop(0.65, `rgba(255,60,80,${0.55 * env})`);
          lg.addColorStop(1, "rgba(255,40,60,0)");
          c.fillStyle = lg;
          // the column's tip fades in over 240 px
          for (let s = 0; s < 8; s++) {
            c.globalAlpha = (s + 0.5) / 8;
            c.fillRect(ex - wdt, top + s * 30, wdt * 2, 30);
          }
          c.globalAlpha = 1;
          c.fillRect(ex - wdt, top + 240, wdt * 2, Math.max(0, 1800 - top - 240));
          ctxG.fillStyle = `rgba(255,60,80,${0.9 * env})`;
          ctxG.fillRect((ex - wdt * 2.2) / 2, top / 2, (wdt * 4.4) / 2, (1800 - top) / 2);
          if (!minor) {
            c.fillStyle = `rgba(255,120,130,${0.5 * env})`;
            c.fillRect(ex - 1, 0, 2, H);
          }
        }
        if (!minor) {
          sparks(c, ctxG, e, ex, ey, dt, true, Math.floor(70 + 90 * k));
          const rt = dt / 0.65;
          if (rt < 1) {
            const rx = 50 + 900 * Math.pow(rt, 0.6) * Math.sqrt(k);
            c.strokeStyle = `rgba(255,190,190,${0.75 * (1 - rt)})`;
            c.lineWidth = 2 + 6 * (1 - rt);
            c.beginPath();
            c.ellipse(ex, ey, rx, rx * 0.3, 0, 0, Math.PI * 2);
            c.stroke();
          }
        }
      } else {
        const f = Math.floor(dt * 30);
        const lifeB = minor ? 0.16 : 0.34;
        const vis = dt < 0.07 || (dt < lifeB && h3(e.id, f, 9) > 0.35);
        if (vis) {
          const seed = e.id * 97 + Math.floor(dt * 15);
          const x0 = ex + (h2(e.id, 1) - 0.5) * 420;
          const pts = bolt(x0, -60, ex, ey, seed, 0.32, minor ? 5 : 7);
          const a = minor ? 0.7 : 1;
          ctxG.strokeStyle = `rgba(120,255,200,${0.9 * a})`;
          ctxG.lineWidth = minor ? 4 : 7;
          strokePts(ctxG, pts, 0.5);
          c.strokeStyle = `rgba(140,255,205,${0.55 * a})`;
          c.lineWidth = minor ? 4 : 8;
          strokePts(c, pts, 1);
          c.strokeStyle = `rgba(255,255,255,${a})`;
          c.lineWidth = minor ? 1.4 : 2.6;
          strokePts(c, pts, 1);
          if (!minor) {
            for (let br = 0; br < 3; br++) {
              const from = pts[Math.floor((0.25 + 0.5 * h3(seed, br, 5)) * (pts.length - 1))];
              const len = 180 + 260 * h3(seed, br, 6);
              const ang = Math.PI / 2 + (h3(seed, br, 7) - 0.5) * 1.6;
              const bp = bolt(from[0], from[1], from[0] + Math.cos(ang) * len, from[1] + Math.sin(ang) * len, seed + br * 31, 0.4, 5);
              c.strokeStyle = "rgba(220,255,240,0.7)";
              c.lineWidth = 1.4;
              strokePts(c, bp, 1);
              ctxG.lineWidth = 3;
              strokePts(ctxG, bp, 0.5);
            }
          }
        }
        // impact orb
        const env = Math.exp(-dt / (minor ? 0.12 : 0.28));
        const r = (minor ? 26 : 60) * k * (1 + dt * 1.8);
        const og = c.createRadialGradient(ex, ey, 0, ex, ey, r);
        og.addColorStop(0, `rgba(255,255,255,${0.95 * env})`);
        og.addColorStop(0.35, `rgba(160,255,215,${0.6 * env})`);
        og.addColorStop(1, "rgba(31,224,143,0)");
        c.fillStyle = og;
        c.fillRect(ex - r, ey - r, r * 2, r * 2);
        ctxG.fillStyle = `rgba(120,255,200,${0.8 * env})`;
        ctxG.beginPath();
        ctxG.arc(ex / 2, ey / 2, r * 0.5, 0, Math.PI * 2);
        ctxG.fill();
        if (!minor) sparks(c, ctxG, e, ex, ey, dt, false, Math.floor(50 + 60 * k));
      }
    }
    ctxG.restore();
    c.restore();
  }

  // b116-b120: everything leans into the head before the biggest day
  function drawCharge(t, ph) {
    const k = ramp(t, B(115.5), B(119.9)) * (t < B(120) ? 1 : 0);
    if (k <= 0) return;
    const c = ctx;
    c.save();
    c.globalCompositeOperation = "lighter";
    for (let p = 0; p < 160; p++) {
      const life = 0.9;
      const ph0 = h2(p, 41);
      const u = ((t * 1.6 + ph0) % life) / life; // 0 far -> 1 at head
      const ang = h2(p, 42) * Math.PI * 2;
      const dist = (1 - u) * (380 + 420 * h2(p, 43));
      const x = ph.hx + Math.cos(ang) * dist;
      const y = ph.hy + Math.sin(ang) * dist;
      const x2 = ph.hx + Math.cos(ang) * (dist + 40 + 50 * u);
      const y2 = ph.hy + Math.sin(ang) * (dist + 40 + 50 * u);
      c.strokeStyle = `rgba(255,${Math.floor(170 + 80 * u)},${Math.floor(150 + 100 * u)},${0.7 * k * u})`;
      c.lineWidth = 1.5;
      c.beginPath();
      c.moveTo(x2, y2);
      c.lineTo(x, y);
      c.stroke();
    }
    const r = 30 + 90 * k + 10 * Math.sin(t * 40);
    const rg = c.createRadialGradient(ph.hx, ph.hy, 0, ph.hx, ph.hy, r);
    rg.addColorStop(0, `rgba(255,255,255,${0.9 * k})`);
    rg.addColorStop(1, "rgba(255,80,90,0)");
    c.fillStyle = rg;
    c.fillRect(ph.hx - r, ph.hy - r, r * 2, r * 2);
    c.restore();
  }

  // ------------------------------------------------------------------ company wall
  const pctTxt = (v) => `${v >= 0 ? "+" : "−"}${Math.abs(v * 100).toFixed(Math.abs(v) >= 0.1 ? 0 : 1)}%`;
  function wallRef(i) {
    const hiNow = HI[i];
    const bear = C[i] / hiNow - 1 <= -0.08;
    return bear ? { ref: HIIDX[i], bear } : { ref: Math.max(0, i - 252), bear };
  }
  function drawWall(t, look, cam) {
    const hd = clamp(headAt(t), FIRST, LAST);
    const i = Math.round(hd);
    const { ref } = wallRef(i);
    const dx = 26 * Math.sin(t * 0.11);
    const dy = 30 * Math.sin(t * 0.083 + 1);
    wall.style.transform = `translate3d(0, 0, ${(cam.z - 240).toFixed(1)}px) rotateX(${cam.pitch.toFixed(2)}deg) rotateZ(${cam.yaw.toFixed(2)}deg) translate3d(${dx.toFixed(1)}px, ${dy.toFixed(1)}px, 0)`;
    wallWrap.style.opacity = look.floor.toFixed(3);
    // the latest era change that has started decides each tile's flip
    let ev = null;
    for (const e of ERA_EV) if (e.t <= t) ev = e;
    const era = eraOf(i);
    cos.forEach((tile, k) => {
      let p = 1;
      let shown = era;
      if (ev && t - ev.t < 1.2) {
        p = clamp((t - ev.t - k * 0.022) / 0.3, 0, 1);
        shown = p < 0.5 ? ev.from : ev.to;
      }
      const flip = Math.abs(Math.cos(Math.PI * p));
      tile.inner.style.transform = `scaleY(${Math.max(0.02, flip).toFixed(3)})`;
      const co = COS.eras[shown].list[k];
      if (tile.who !== `${shown}:${k}`) {
        tile.who = `${shown}:${k}`;
        tile.cw.textContent = co.w;
        tile.cz.textContent = co.zh;
        const base = Math.min(tile.w, tile.h);
        const fit = (tile.w * 0.86) / (co.w.length * 0.46);
        tile.cw.style.fontSize = `${clamp(Math.min(base * 0.2, fit), 22, 96).toFixed(0)}px`;
        tile.cz.style.fontSize = `${clamp(base * 0.1, 18, 40).toFixed(0)}px`;
        tile.cp.style.fontSize = `${clamp(base * 0.25, 28, 120).toFixed(0)}px`;
      }
      const v = coVal(co.t, i);
      const v0 = coVal(co.t, ref);
      let key;
      if (v === null || v0 === null) {
        key = "na";
        if (tile.key !== key) {
          tile.el.className = "co na";
          // no price on one side of the comparison: Yahoo's data starts later (1962 at the earliest)
          tile.cp.textContent = "—";
          tile.el.style.setProperty("--a", "0");
        }
      } else {
        const pc = v / v0 - 1;
        const txt = pctTxt(pc);
        key = txt;
        if (tile.key !== key) {
          tile.el.className = `co ${pc >= 0 ? "pos" : "neg"}`;
          tile.cp.textContent = txt;
          tile.el.style.setProperty("--a", (0.12 + 0.45 * Math.min(1, Math.abs(pc) / 0.6)).toFixed(3));
        }
      }
      tile.key = key;
    });
  }

  // ------------------------------------------------------------------ HUD
  const fmt = (v) => v.toFixed(2);
  const pct = (v, d = 2) => `${v >= 0 ? "+" : "−"}${Math.abs(v * 100).toFixed(d)}%`;
  function drawHud(t, look) {
    const hd = clamp(G.hd, FIRST - 1, LAST);
    const i = Math.min(LAST, Math.round(hd));
    const v = Math.exp(G.hl);
    const hiNow = HI[i];
    const dd = v / hiNow - 1;
    const bear = dd <= -0.08;
    hud.wrap.style.opacity = look.hud.toFixed(3);
    hud.price.textContent = fmt(v);
    hud.date.textContent = dstr(i);
    hud.wrap.classList.toggle("down", bear);
    const wr = wallRef(i);
    const era = COS.eras[eraOf(i)];
    hud.wall.textContent = `磚牆：${era.label} 大型股 · ${wr.bear ? `較 ${dstr(wr.ref)} 高點` : "近 52 週"}`;
    if (bear) {
      hud.ref.textContent = `較 ${dstr(HIIDX[i])} 最高`;
      hud.pct.textContent = `▼ ${pct(dd)}`;
    } else {
      hud.ref.textContent = `較 ${dstr(FIRST)} 起點`;
      hud.pct.textContent = `▲ ${pct(v / C[FIRST] - 1, v / C[FIRST] > 10 ? 0 : 2)}`;
    }
  }

  function drawPanel(t, look) {
    panel.style.opacity = look.panel.toFixed(3);
    panel.style.transform = `translate3d(${(1 - look.panel) * 60}px,0,0)`;
    const got = HITS.filter((e) => e.t <= t);
    const n = got.length;
    count.textContent = `${pad(n)} / 20`;
    const last = got[n - 1];
    const fresh = last ? Math.exp(-(t - last.t) / 0.25) : 0;
    count.style.setProperty("--f", fresh.toFixed(3));
    // "37 years, zero days" note, then "two to go"
    let nt = "";
    if (t >= B(40) && t < B(50)) nt = "1950–1986：37 年，0 天";
    else if (t >= B(151.5) && t < B(160)) nt = "還差 2 天";
    else if (t >= B(160) && t < B(176)) nt = "還差 1 天";
    note.textContent = nt;
    note.style.opacity = nt ? (0.55 + 0.45 * Math.abs(Math.sin(t * 3))).toFixed(3) : "0";
    for (let r = 0; r < 4; r++) {
      const e = got[n - 1 - r];
      const row = rows[r];
      if (!e) {
        row.el.style.opacity = "0";
        continue;
      }
      const top = S.top.find((x) => x.i === e.i);
      row.rank.textContent = `#${top.rank}`;
      row.date.textContent = top.d;
      row.ret.textContent = `+${top.ret.toFixed(2)}%`;
      row.dd.textContent = `距高 ${top.dd.toFixed(1).replace("-", "−")}%`;
      const age = t - e.t;
      const inK = r === 0 ? expo(clamp(age / 0.22, 0, 1)) : 1;
      row.el.style.opacity = ((r === 0 ? inK : 1) * (1 - r * 0.14)).toFixed(3);
      row.el.style.transform = `translate3d(${((1 - inK) * 80).toFixed(1)}px, ${r * 58}px, 0)`;
      row.el.style.setProperty("--f", (r === 0 ? Math.exp(-age / 0.3) : 0).toFixed(3));
    }
  }

  // big labels: two slots, the newest in front, the previous one leaving
  function labelFor(e) {
    const day = iso(e.i);
    const n = NOTE[day] || {};
    const up = e.kind === "up";
    const leave = crossings(Math.min(LAST, e.i + 25), e.t, T_END);
    const hold = leave === null ? 1.6 : clamp(leave - e.t + 0.25, 0.7, 1.6);
    const out = { cls: up ? "up" : "dn", big: pct(e.ret), sub: `${dstr(e.i)}${n.sub ? ` · ${n.sub}` : ""}`, pill: "", ctx: n.ctx || "", hold };
    const rank = up ? S.top.find((x) => x.i === e.i).rank : S.worst.find((x) => x.i === e.i).rank;
    if (up) out.pill = `第 ${rank} 名 · 距高點 ${e.dd.toFixed(1).replace("-", "−")}%`;
    else out.pill = `跌幅第 ${rank} 名`;
    if (e.pass === "hook" && up) {
      out.ctx = "1950 年以來第 3 大單日漲幅";
      out.pill = `前一天 距高點 ${e.dd.toFixed(1).replace("-", "−")}%`;
      out.hold = B(14) - e.t;
      out.ctxAt = P;
      out.pillAt = 2 * P;
    }
    if (e.pass === "replay" && day === "2025-04-09") {
      out.ctx = "又回到開頭那一天";
      out.pill = `第 3 名 · 距高點 ${e.dd.toFixed(1).replace("-", "−")}%`;
      out.hold = B(180) - e.t;
    }
    if (day === "2008-10-13") out.hold = 2.2;
    return out;
  }
  const LABELED = BIG.map((e) => ({ e, L: labelFor(e) }));
  function drawLabels(t, look) {
    let cur = -1;
    for (let k = 0; k < LABELED.length; k++) if (LABELED[k].e.t <= t) cur = k;
    for (let s = 0; s < 2; s++) {
      const slot = labs[s];
      const k = s === 0 ? cur : cur - 1;
      const item = k >= 0 ? LABELED[k] : null;
      if (!item) {
        slot.el.style.opacity = "0";
        continue;
      }
      const { e, L } = item;
      const age = t - e.t;
      const next = LABELED[k + 1];
      let a = 1;
      if (s === 1) a = next ? 1 - clamp((t - next.e.t) / 0.12, 0, 1) : 0;
      a *= 1 - clamp((age - L.hold) / 0.2, 0, 1);
      if (e.pass === "hook" && t > B(14)) a *= 1 - clamp((t - B(14)) / (2 * P), 0, 1);
      a *= look.labels;
      slot.el.style.opacity = a.toFixed(3);
      if (a <= 0) continue;
      if (slot.key !== `${e.id}`) {
        slot.key = `${e.id}`;
        slot.el.className = `lab ${L.cls}`;
        slot.big.textContent = L.big;
        slot.sub.textContent = L.sub;
        slot.pill.textContent = L.pill;
        slot.ctx.textContent = L.ctx;
      }
      const inK = expo(clamp(age / 0.18, 0, 1));
      const sc = s === 0 ? lerp(1.35, 1, inK) : 0.92;
      slot.el.style.transform = `translate3d(-50%, ${s === 0 ? 0 : -16}px, 0) scale(${sc.toFixed(3)})`;
      slot.el.style.setProperty("--blur", `${((1 - inK) * 10).toFixed(2)}px`);
      slot.ctx.style.opacity = clamp((age - (L.ctxAt || 0.15)) / 0.15, 0, 1).toFixed(3);
      slot.pill.style.opacity = clamp((age - (L.pillAt || 0.1)) / 0.15, 0, 1).toFixed(3);
    }
  }

  function drawMarks(t, ph) {
    let m = null;
    for (const e of MARKEV) if (e.t !== null && t >= e.t && t < e.t + 1.8) m = e;
    if (!m || t > B(180)) {
      mark.style.opacity = "0";
      return;
    }
    const x = G.x(m.i);
    const y = G.y(LOG[m.i]);
    const age = t - m.t;
    mark.style.opacity = (clamp(age / 0.15, 0, 1) * (1 - clamp((age - 1.55) / 0.25, 0, 1))).toFixed(3);
    mark.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
    mark.classList.toggle("below", y < 1120);
    markText.textContent = `${dstr(m.i)} ${m.text}`;
    markVal.textContent = fmt(C[m.i]);
  }

  function drawStamp(t) {
    let s = null;
    for (const e of BEAR) if (t >= e.t && t < e.t + e.d) s = e;
    if (!s) {
      stamp.style.opacity = "0";
      return;
    }
    const age = t - s.t;
    const inK = expo(clamp(age / 0.14, 0, 1));
    stamp.style.opacity = (inK * (1 - clamp((age - (s.d - 0.22)) / 0.22, 0, 1))).toFixed(3);
    stamp.style.transform = `rotate(-8deg) scale(${lerp(1.6, 1, inK).toFixed(3)})`;
    stamp.querySelector(".st-d").textContent = `${dstr(s.i)} · 距高點 −20%`;
  }

  // ------------------------------------------------------------------ text scenes
  const TXT = {
    q1: $("q1"), q2: $("q2"), rw: $("rw"), rwYear: $("rw-year"), rwTag: $("rw-tag"),
    s1: $("stat1"), s2: $("stat2"), s3: $("stat3"), fin: $("final"),
  };
  function textIn(el, t, a, b, fi = 0.2, fo = 0.2) {
    const k = win(t, a, b, fi, fo);
    el.style.opacity = k.toFixed(3);
    const inK = expo(ramp(t, a, a + fi * 1.5));
    el.style.transform = `translate3d(0, ${((1 - inK) * 40).toFixed(1)}px, 0)`;
    el.style.setProperty("--blur", `${((1 - inK) * 8).toFixed(2)}px`);
    return k;
  }
  function drawTexts(t) {
    textIn(TXT.q1, t, B(7), B(14.6), 0.25, 0.18);
    textIn(TXT.q2, t, B(9), B(14.6), 0.25, 0.18);
    // rewind tag and the year
    const rwK = win(t, B(14.2), B(22.6), 0.1, 0.3);
    TXT.rw.style.opacity = rwK.toFixed(3);
    TXT.rwTag.style.opacity = (0.6 + 0.4 * Math.abs(Math.sin(t * 9))).toFixed(3);
    const yr = YMD[Math.max(0, Math.round(clamp(headAt(t), FIRST, LAST))) * 3];
    TXT.rwYear.textContent = t >= B(20) ? "回到 1950" : `${yr}`;
    TXT.rwYear.classList.toggle("land", t >= B(20));
    const hold = t >= B(20) ? expo(ramp(t, B(20), B(20.6))) : 0;
    TXT.rwYear.style.transform = `scale(${lerp(1, 1.12, hold * (1 - ramp(t, B(21), B(22.5)))).toFixed(3)})`;
    textIn(TXT.s1, t, B(181.5), B(187), 0.18, 0.15);
    textIn(TXT.s2, t, B(187), B(193), 0.18, 0.15);
    textIn(TXT.s3, t, B(193), B(200), 0.18, 0.2);
    textIn(TXT.fin, t, B(200), T_END + 1, 0.4, 0.2);
    // count-ups on each stat
    const cu = (el, a, n) => {
      el.textContent = `${Math.round(n * expo(ramp(t, a, a + 1.3)))} / 20`;
    };
    cu($("s1n"), B(181.5), S.stats.below200);
    cu($("s2n"), B(187), S.stats.bear);
    cu($("s3n"), B(193), S.stats.nearWorst);
  }

  // ------------------------------------------------------------------ look: what is on, per time
  function lookAt(t) {
    const out = ramp(t, B(180), B(183));
    const fin = ramp(t, B(200), B(202));
    return {
      grid: (1 - 0.6 * out) * (1 - ramp(t, B(182.5), B(183.5)) * (1 - ramp(t, B(193), B(194)))),
      ma: 1,
      maHi: win(t, B(181.5), B(187), 0.4, 0.3),
      hi: 1 - out,
      m1: smooth(ramp(t, B(182.5), B(184))) * (1 - smooth(ramp(t, B(187), B(188)))),
      m2: smooth(ramp(t, B(187), B(188))) * (1 - smooth(ramp(t, B(193), B(194)))),
      pins: ramp(t, B(181.5), B(183.5)),
      worst: ramp(t, B(193.5), B(194.5)),
      head: 1 - 0.7 * out,
      rewind: win(t, B(14.4), B(21.6), 0.35, 0.6),
      glitch: win(t, B(13.8), B(14.6), 0.05, 0.3) + win(t, B(21.8), B(24.2), 0.05, 0.3) * 0.6,
      floor: lerp(0.46, 0.06, out) * (t < B(22) ? 1 : t < B(24) ? 0.25 : 1) * (1 - 0.35 * win(t, B(88), B(104), 1, 1)),
      hud: (1 - ramp(t, B(180), B(181.4))) * (t < B(22) || t >= B(24) ? 1 : 0.4),
      panel: ramp(t, B(24), B(25.2)) * (1 - ramp(t, B(180), B(181.5))),
      labels: 1,
      chartDim: 1 - 0.55 * fin,
    };
  }

  // ------------------------------------------------------------------ frame
  let ready = false;
  function renderAt(t) {
    if (!ready) return;
    const look = lookAt(t);
    const sh = shock(t);
    frame(t, look);
    const freeze = win(t, B(6.6), B(14.4), 0.5, 0.2);
    drawBg(t, 1 - 0.5 * freeze);
    drawChart(t, sh, look);
    cv.style.opacity = look.chartDim.toFixed(3);
    const cam = camAt(t);
    drawWall(t, look, cam);
    // the chart plane turns with a third of the yaw so the line stays readable, and squares up for the outro
    $("chart-plane").style.transform = `translate3d(0, 0, ${(cam.z * 0.35).toFixed(1)}px) rotateY(${(cam.yaw * 0.32 * cam.calm).toFixed(2)}deg) rotateX(${((cam.pitch - 52) * 0.12 * cam.calm).toFixed(2)}deg)`;
    drawHud(t, look);
    drawPanel(t, look);
    drawLabels(t, look);
    drawMarks(t);
    drawStamp(t);
    drawTexts(t);

    // camera: shake, the breath before the biggest day, the punch after it
    const f = Math.floor(t * 30);
    const dx = sh.amp * (h2(f, 1) - 0.5) * 2;
    const dy = sh.amp * (h2(f, 2) - 0.5) * 2;
    const charge = ramp(t, B(115.5), B(120)) * (t < B(120) ? 1 : 0);
    const punch = t >= B(120) ? Math.exp(-(t - B(120)) / 0.25) : 0;
    const drift = 1 + 0.012 * Math.sin(t * 0.21);
    const sc = drift * (1 + 0.05 * charge - 0.03 * punch);
    stage.style.transform = `translate3d(${dx.toFixed(2)}px, ${dy.toFixed(2)}px, 0) scale(${sc.toFixed(4)})`;
    const gray = freeze;
    stage.style.filter = gray > 0.001 ? `grayscale(${gray.toFixed(3)}) brightness(${(1 - 0.25 * gray).toFixed(3)})` : "none";
    stage.style.setProperty("--ca", `${(1 + 6 * sh.ca + 6 * look.rewind).toFixed(2)}px`);

    // overlay: flash, vignette pulse, grain
    ctxF.clearRect(0, 0, W, H);
    if (sh.fl > 0.003) {
      ctxF.fillStyle = `rgba(${sh.flc[0]},${sh.flc[1]},${sh.flc[2]},${Math.min(0.5, sh.fl)})`;
      ctxF.fillRect(0, 0, W, H);
    }
    const blink = win(t, B(21.9), B(24.2), 0.05, 0.25);
    if (blink > 0) {
      ctxF.fillStyle = `rgba(0,0,0,${0.75 * blink})`;
      ctxF.fillRect(0, 0, W, H);
    }
    const land = t >= B(24) ? Math.exp(-(t - B(24)) / 0.12) : 0;
    if (land > 0.003) {
      ctxF.fillStyle = `rgba(255,255,255,${0.55 * land})`;
      ctxF.fillRect(0, 0, W, H);
    }
    const boom = t >= B(120) ? Math.exp(-(t - B(120)) / 0.1) : 0;
    if (boom > 0.003) {
      ctxF.fillStyle = `rgba(255,245,240,${0.7 * boom})`;
      ctxF.fillRect(0, 0, W, H);
    }
    // grain changes every other frame and stays light, so platform re-encodes keep it as texture
    const gf = f >> 1;
    ctxF.globalAlpha = 0.035;
    const gt = GRAIN[gf % 4];
    const ox = Math.floor(h2(gf, 7) * 256);
    const oy = Math.floor(h2(gf, 8) * 256);
    ctxF.globalCompositeOperation = "overlay";
    for (let y = -oy; y < H; y += 256) for (let x = -ox; x < W; x += 256) ctxF.drawImage(gt, x, y);
    ctxF.globalCompositeOperation = "source-over";
    ctxF.globalAlpha = 1;
  }

  window.__hf = window.__hf || {};
  window.__hf.buildReady = window.__hf.buildReady || {};
  window.__hf.buildReady.film = (async () => {
    await Promise.all([
      document.fonts.load("700 120px 'Barlow Condensed'"),
      document.fonts.load("500 24px 'Barlow Condensed'"),
      document.fonts.load("700 40px 'Noto Sans TC Sub'"),
      document.fonts.load("500 30px 'Noto Sans TC Sub'"),
    ]);
    $("s1base").textContent = `${S.stats.baseBelow200}%`;
    const ex = S.top.find((r) => r.dd > -20);
    $("s2ex").textContent = ex.d;
    $("s2dd").textContent = `${ex.dd.toFixed(1).replace("-", "−")}%`;
    ready = true;
    renderAt(window.__filmTime || 0);
  })();
  window.addEventListener("hf-seek", (e) => {
    window.__filmTime = e.detail.time;
    renderAt(e.detail.time);
  });
  window.__filmRenderAt = (t) => {
    ready = true;
    renderAt(t);
  };
  window.__filmDebug = { EV, BEAR, MARKEV, HITS, headAt, B };
})();
