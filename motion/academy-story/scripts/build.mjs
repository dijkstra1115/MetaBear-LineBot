// Builds index.html from scripts/template.html: word timings, the generated UI (indicator clutter, the typed
// question, trades → candle → series → level → plan) and writes assets/audio/sfx.json for scripts/mix.mjs.
// Usage: node scripts/build.mjs
import fs from "node:fs";
import { C, END } from "./cues.mjs";

const r = (x) => +x.toFixed(3);
const hash = (i) => {
  const s = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
};
const T = { END };

// ---------- S1 words ----------
const L1 = ["Reading", "the", "market", "was", "never", "meant", "to", "feel", "like", "guesswork."].map((w, i) => ({
  w, t: C[["reading", "the", "market", "was", "never", "meant", "to", "feel", "like", "guesswork"][i]],
}));
T.L1 = L1.map((x, i) => `<span id="l1-${i}"${i === 9 ? ' class="accent"' : ""}>${x.w}</span>`).join("");

// ---------- S2 clutter ----------
T.MACD = Array.from({ length: 22 }, (_, i) => {
  const v = Math.sin(i * 0.55) * 40 + (hash(i) - 0.5) * 20;
  return `<i style="display:block;width:12px;height:${Math.abs(v).toFixed(0)}px;margin-top:${v < 0 ? Math.abs(v).toFixed(0) : -Math.abs(v).toFixed(0)}px;background:${v >= 0 ? "#78e1d5" : "#f09a5a"};opacity:0.85"></i>`;
}).join("");
{
  let p = 120;
  const cs = [];
  const ma = [[], [], []];
  for (let i = 0; i < 26; i++) {
    const o = p;
    p += (hash(i + 40) - 0.48) * 26;
    const c = p;
    const h = Math.min(o, c) - hash(i + 80) * 16;
    const l = Math.max(o, c) + hash(i + 90) * 16;
    const x = 12 + i * 22;
    cs.push(`<line x1="${x}" y1="${h.toFixed(1)}" x2="${x}" y2="${l.toFixed(1)}" stroke="${c < o ? "#78e1d5" : "#f09a5a"}" stroke-width="2"/><rect x="${x - 6}" y="${Math.min(o, c).toFixed(1)}" width="12" height="${Math.max(2, Math.abs(c - o)).toFixed(1)}" fill="${c < o ? "#78e1d5" : "#f09a5a"}"/>`);
    ma[0].push(`${x},${(p + Math.sin(i / 2) * 8).toFixed(1)}`);
    ma[1].push(`${x},${(120 + Math.sin(i / 4) * 30).toFixed(1)}`);
    ma[2].push(`${x},${(140 + Math.cos(i / 5) * 24).toFixed(1)}`);
  }
  T.CLUTTER = [
    `<path d="M0 60 Q 290 10 588 70 L 588 190 Q 290 230 0 180 Z" fill="rgba(122,167,255,0.08)" stroke="rgba(122,167,255,0.4)" stroke-width="1.5"/>`,
    ...cs,
    `<polyline points="${ma[0].join(" ")}" fill="none" stroke="#e8bd7d" stroke-width="2"/>`,
    `<polyline points="${ma[1].join(" ")}" fill="none" stroke="#c9b7ff" stroke-width="2"/>`,
    `<polyline points="${ma[2].join(" ")}" fill="none" stroke="#7aa7ff" stroke-width="2"/>`,
    `<line x1="0" y1="96" x2="588" y2="96" stroke="#f09a5a" stroke-dasharray="4 6"/><line x1="0" y1="150" x2="588" y2="150" stroke="#78e1d5" stroke-dasharray="4 6"/>`,
  ].join("");
}
const box = { "k-rsi": [150, 120, 460, 250], "k-macd": [1330, 110, 440, 230], "k-chat": [1300, 650, 520, 330], "k-ind": [140, 640, 340, 400], "k-chart": [650, 80, 640, 320], "k-sig": [560, 665, 470, 190], "k-notes": [560, 885, 520, 150] };
const depth = { "k-rsi": [-120, 3, 0.85], "k-macd": [-200, 5, 0.8], "k-chat": [40, 1, 0.95], "k-ind": [-320, 7, 0.7], "k-chart": [-60, 2, 0.9], "k-sig": [-160, 4, 0.85], "k-notes": [0, 1, 0.9] };
const CARDS = Object.entries(box).map(([id, [x, y, w, h]], i) => ({
  id, z: depth[id][0], blur: depth[id][1], o: depth[id][2],
  dx: r((hash(i + 5) - 0.5) * 70), dy: r((hash(i + 9) - 0.5) * 50), cx: x + w / 2, cy: y + h / 2,
}));

// ---------- S4 typed question ----------
const QTEXT = "衝上去，怎麼又回來？";
const Q = [...QTEXT].map((ch, i) => ({ ch, t: r(C.pick + 0.12 + i * 0.075) }));
T.Q = Q.map((q, i) => `<span id="q-${i}">${q.ch}</span>`).join("");
const SEND = r(C.question + 0.75);

// ---------- S5 trades → candle → series → level → plan ----------
const y = (p) => 820 - (p - 96) * 32;
const SERIES_OHLC = [
  [104, 106, 103, 105], [105, 107, 103.5, 104], [104, 104.5, 100.6, 103], [103, 106, 102.8, 105.5], [105.5, 108, 104.5, 107],
  [107, 107.5, 103, 103.5], [103.5, 104, 100.4, 102.8], [102.8, 105, 102.5, 104.6], [104.6, 106.5, 103.8, 106], [106, 106.2, 103, 103.4],
  [103.4, 103.8, 100.8, 103.2], [103.2, 105.6, 102.9, 105.2], [105.2, 107, 104.6, 106.4],
];
const cx = (i) => 300 + i * 86;
T.CANDLES = SERIES_OHLC.map(([o, h, l, c], i) => {
  const col = c >= o ? "#78e1d5" : "#f09a5a";
  return `<div class="cdl" id="cdl-${i}" style="left:${cx(i)}px;top:0"><div class="wk" style="top:${y(h)}px;height:${y(l) - y(h)}px;background:${col}"></div><div class="bd" style="top:${y(Math.max(o, c))}px;height:${Math.max(4, y(Math.min(o, c)) - y(Math.max(o, c)))}px;background:${col}"></div></div>`;
}).join("\n          ");
const HERO_OHLC = [106.4, 109.4, 105.8, 108.6];
const HERO = { x: 942, toX: cx(13) };
Object.assign(T, {
  HERO_X: HERO.x,
  HW_TOP: y(HERO_OHLC[1]), HW_H: y(HERO_OHLC[2]) - y(HERO_OHLC[1]),
  HB_TOP: y(HERO_OHLC[3]), HB_H: y(HERO_OHLC[0]) - y(HERO_OHLC[3]),
  BAND_TOP: y(102), BAND_H: y(100) - y(102), BAND_TAG: y(100) + 18,
});
const TOUCH = [2, 6, 10].map((i) => ({ x: cx(i) + 18, y: y(SERIES_OHLC[i][2]) }));
T.TOUCHES = TOUCH.map((t, i) => `<div class="touch" id="touch-${i}" style="left:${t.x}px;top:${t.y}px"></div>`).join("");
const DOTS = Array.from({ length: 18 }, (_, i) => {
  const buy = hash(i + 200) > 0.38;
  const price = HERO_OHLC[2] + hash(i + 300) * (HERO_OHLC[1] - HERO_OHLC[2]);
  return {
    id: `dot-${i}`, buy, y: r(y(price)),
    x0: buy ? -40 - hash(i) * 80 : 1960 + hash(i) * 80,
    x1: buy ? 820 - hash(i + 1) * 90 : 1100 + hash(i + 1) * 90,
    t: r(C.trades + ((C.candles1 - 0.45 - C.trades) * i) / 17),
  };
});
T.DOTS = DOTS.map((d) => `<div class="dot${d.buy ? "" : " s"}" id="${d.id}"></div>`).join("");
// after the chart shifts 220px left, wire from the last touch to the plan's first row
const wx = TOUCH[2].x - 220, wy = TOUCH[2].y;
T.WIRE = `M ${wx} ${wy} C ${wx + 190} ${wy}, ${1150} 414, 1318 414`;
T.WIRE_NX = wx;
T.WIRE_NY = wy;
const PLAN_ROWS = [["地點", "支撐區 100–102"], ["事件", "回測，賣壓被吸收"], ["確認", "收回區間上方"], ["執行", "確認後才進場"]];
const PLAN = [C.levels2 + 0.15, C.become3, C.become3 + 0.25, C.decisions].map((t) => ({ t: r(t) }));
T.PLAN = PLAN_ROWS.map(([k, v], i) => `<div class="prow" id="prow-${i}"><div class="ck"><i id="ck-${i}"></i><svg viewBox="0 0 22 22" aria-hidden="true"><polyline id="ckp-${i}" points="4,12 9,17 18,6" fill="none" stroke="#062521" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="40" /></svg></div><b>${k}</b><span>${v}</span></div>`).join("\n          ");
const FIN = r(C.voEnd + 0.75);

let html = fs.readFileSync("scripts/template.html", "utf8");
html = html.replace(/__([A-Z0-9_]+)__/g, (m, k) => (k in T ? String(T[k]) : m));
html = html.replace("/*__DATA__*/", [
  `const C = ${JSON.stringify(C)};`,
  `const END = ${END};`,
  `const L1 = ${JSON.stringify(L1.map(({ t }) => ({ t })))};`,
  `const CARDS = ${JSON.stringify(CARDS)};`,
  `const Q = ${JSON.stringify(Q.map(({ t }) => ({ t })))};`,
  `const SEND = ${SEND};`,
  `const DOTS = ${JSON.stringify(DOTS)};`,
  `const HERO = ${JSON.stringify(HERO)};`,
  `const SERIES = ${JSON.stringify(SERIES_OHLC)};`,
  `const TOUCH = ${JSON.stringify(TOUCH)};`,
  `const PLAN = ${JSON.stringify(PLAN)};`,
  `const FIN = ${FIN};`,
].join("\n      "));
if (/__[A-Z0-9_]+__/.test(html)) throw Error("unfilled placeholder " + html.match(/__[A-Z0-9_]+__/)[0]);
fs.writeFileSync("index.html", html);

// ---------- sound design: few, large, deliberate ----------
const sfx = [];
const add = (type, t, o = {}) => sfx.push({ type, t: r(t), ...o });
add("drone", 0, { dur: END, gain: 0.065 });
add("swell", C.guesswork - 0.6, { dur: 1.6, gain: 0.07 });
add("air", C.guesswork, { gain: 0.06 });
add("whoosh", C.too1 - 0.45, { dur: 0.7, up: true, gain: 0.12 });
add("thock", C.indicators, { gain: 0.16 });
add("thock", C.opinions, { gain: 0.16 });
add("riser", C.so - 0.2, { dur: C.metabear - C.so + 0.2, gain: 0.12 });
add("boom", C.metabear, { gain: 0.55 });
add("air", C.metabear + 0.05, { gain: 0.08 });
add("whoosh", C.pick - 0.8, { dur: 0.6, up: false, gain: 0.08 });
Q.forEach((q, i) => add("key", q.t, { gain: 0.05, pitch: 1800 + (i % 3) * 140 }));
add("click", SEND, { gain: 0.18 });
add("whoosh", C.watch - 0.5, { dur: 0.6, up: true, gain: 0.14 });
add("sub", C.watch - 0.05, { gain: 0.2 });
DOTS.forEach((d, i) => i % 2 === 0 && add("tick", d.t + 0.4, { pitch: 2300 + (i % 5) * 120, gain: 0.025 }));
add("pop", C.candles1 + 0.3, { gain: 0.16 });
add("whoosh", C.candles2 - 0.15, { dur: 0.7, up: false, gain: 0.06 });
add("ping", C.levels1 + 0.1, { pitch: 659, gain: 0.07 });
add("whoosh", C.and - 0.1, { dur: 0.7, up: true, gain: 0.07 });
PLAN.forEach((p, i) => add("ping", p.t, { pitch: [784, 880, 988, 1175][i], gain: 0.06 }));
add("boom", C.decisions, { gain: 0.35 });
add("whoosh", C.l5end + 0.1, { dur: 0.7, up: false, gain: 0.08 });
add("swell", C.every - 0.3, { dur: 1.8, gain: 0.05 });
add("boom", FIN, { gain: 0.3 });
add("air", FIN + 0.05, { gain: 0.06 });
fs.writeFileSync("assets/audio/sfx.json", JSON.stringify({ end: END, off: C.reading - 0.39, sfx }));
console.log(`index.html ${END}s · ${sfx.length} sounds`);
