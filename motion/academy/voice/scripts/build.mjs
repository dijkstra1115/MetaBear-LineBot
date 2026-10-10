// Builds index.html from scripts/template.html: fills in the word cues, generated DOM (price axis, trade chips,
// lesson tiles, evidence cards) and cursor paths, and writes assets/audio/sfx.json for scripts/mix.mjs.
// Usage: node scripts/build.mjs
import fs from "node:fs";
import { C, END } from "./cues.mjs";

const r3 = (x) => +x.toFixed(3);
const yOf = (p) => 650 - (p - 100) * 40;

// ---------- S1 · trades that build one candle (open 100 → close 106, high 110, low 98) ----------
const TRADES = [[101, 3], [103, 5], [102, -2], [105, 8], [104, -3], [107, 6], [110, 4], [108, -5], [99, -7], [98, -4], [103, 9], [106, 6], [105, -2], [106, 3]];
const hash = (i) => {
  const s = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
};
const t0 = 0.75;
const span = C.decisions - 0.5 - t0;
const CHIPS = TRADES.map(([price, size], i) => {
  const buy = size > 0;
  const t = r3(t0 + (span * i) / (TRADES.length - 1));
  return {
    id: `chip-${i}`, price, close: price, buy,
    text: `${buy ? "▲" : "▼"} ${Math.abs(size)} @ ${price}`,
    x0: buy ? -260 + hash(i) * 120 : 1980 + hash(i) * 120,
    y0: yOf(price) - 16 + (hash(i + 7) - 0.5) * 260,
    x1: buy ? 700 + hash(i + 3) * 60 : 1100 + hash(i + 3) * 60,
    y1: yOf(price) - 18,
    fly: 0.42, t0: t, t1: r3(t + 0.48),
  };
});
const chipsHtml = CHIPS.map((c) => `<div class="chip${c.buy ? "" : " sell"}" id="${c.id}" data-layout-allow-overlap>${c.text}</div>`).join("\n          ");
const axisHtml = [98, 100, 102, 104, 106, 108, 110].map((p, i) => `<div class="axis-tick" id="axis-${i}" style="top:${yOf(p)}px">${p}</div>`).join("\n          ");

// ---------- S3 · lesson wall ----------
const lessons = JSON.parse(fs.readFileSync("assets/img/lessons/lessons.json", "utf8"));
const TILES = lessons.map((l, i) => ({ id: l.id, x: 105 + (i % 6) * 288, y: 209 + Math.floor(i / 6) * 170 }));
const HERO = TILES.findIndex((t) => t.id === "btc-wall");
const kindTag = { concept: "C", story: "S", strategy: "T" };
const tilesHtml = TILES.map((t, i) => {
  const l = lessons[i];
  return `<div class="tile" id="tile-${i}" style="left:${t.x}px;top:${t.y}px"><img src="assets/img/lessons/${l.id}.jpg" alt="" /><span class="num">${kindTag[l.kind] ?? "L"}/${l.number}</span><i class="bar" id="bar-${i}"></i></div>`;
}).join("\n          ");

// ---------- S5 · evidence cards ----------
const evEnd = C.and + 1.0;
const scatter = [[170, 160, -6], [1260, 130, 5], [320, 600, 4], [1190, 580, -5]];
const evT = [C.until, C.until + 0.27, C.evidence, C.evidence + 0.22];
const EVID = scatter.map(([x, y, r], i) => ({
  t: r3(evT[i]), x0: x + (x < 900 ? -500 : 500), y0: y + (y < 500 ? -300 : 300), r0: r * 3,
  x1: x, y1: y, r1: r, x2: 70 + i * 450, y2: 420,
}));
const evHtml = EVID.map((e, i) => {
  const dur = r3(evEnd - e.t);
  return `<div class="ev" id="ev-${i}"><video class="fill" id="v-ev${i}" src="assets/video/ev${i + 1}.mp4" muted playsinline data-start="${e.t}" data-duration="${dur}" data-media-start="0.1" data-playback-rate="${r3(2.0 / dur)}" data-track-index="${20 + i}"></video></div>`;
}).join("\n          ");
const nodesHtml = EVID.map((e, i) => `<div class="ev-node" id="ev-node-${i}" style="left:${e.x2 + 185}px"><svg viewBox="0 0 32 32" aria-hidden="true"><polyline points="6,17 13,24 26,9" fill="none" stroke="#78e1d5" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="50" /></svg></div>`).join("\n          ");

// ---------- cursors ----------
const sliceLog = (name, m0, m1) => {
  const L = JSON.parse(fs.readFileSync(`assets/video/${name}.json`, "utf8"));
  const base = Math.max(0, Math.floor(m0 * L.fps) - 2);
  const top = Math.min(L.frames.length - 1, Math.ceil(m1 * L.fps) + 2);
  const pts = [];
  for (let i = base; i <= top; i++) pts.push([+L.frames[i].x.toFixed(1), +L.frames[i].y.toFixed(1)]);
  return { fps: L.fps, base, pts, boxes: L.boxes, events: L.events };
};
const O2_RATE = r3((3.97 - 2.6) / (C.watch - C.scrub));
const curO = sliceLog("open", 2.4, 4.0);
const curA = sliceLog("main", 5.6, 5.6 + (C.mb - (C.test - 0.4)));
const STAGE = curO.boxes.stage;

// ---------- timings that go into attributes ----------
const T = {
  END: r3(END),
  S2_DUR: r3(C.p3 - C.p2),
  O1_DUR: r3(C.scrub - C.pause),
  O2_DUR: r3(C.watch - C.scrub), O2_RATE,
  W1_DUR: r3(C.give - C.watch), W1_RATE: r3((4.95 - 0.2) / (C.give - C.watch)),
  W2_DUR: r3(C.real - C.give), W2_RATE: r3((6.4 - 4.95) / (C.real - C.give)),
  R_DUR: r3(C.until + 0.6 - C.real), R_RATE: r3(5.8 / (C.until + 0.6 - C.real)),
  A_DUR: r3(C.mb - (C.test - 0.4)),
};

let html = fs.readFileSync("scripts/template.html", "utf8")
  .replace("__AXIS__", axisHtml)
  .replace("__CHIPS__", chipsHtml)
  .replace("__TILES__", tilesHtml)
  .replace("__EVIDENCE__", evHtml)
  .replace("__NODES__", nodesHtml)
  .replace('data-start="__C_test__" data-duration="__A_DUR__" data-media-start="6.0"', `data-start="${r3(C.test - 0.4)}" data-duration="__A_DUR__" data-media-start="5.6"`)
  .replace("/*__DATA__*/", [
    `const C = ${JSON.stringify(C)};`,
    `const END = ${T.END};`,
    `const CHIPS = ${JSON.stringify(CHIPS.map(({ id, price, close, x0, y0, x1, y1, fly, t0, t1 }) => ({ id, price, close, x0: r3(x0), y0: r3(y0), x1: r3(x1), y1: r3(y1), fly, t0, t1 })))};`,
    `const TILES = ${JSON.stringify(TILES)};`,
    `const HERO = ${HERO};`,
    `const STAGE = ${JSON.stringify({ cx: STAGE.cx, cy: STAGE.cy, w: STAGE.w })};`,
    `const EVID = ${JSON.stringify(EVID)};`,
    `const O2_RATE = ${O2_RATE};`,
    `const CURSOR_O = ${JSON.stringify({ fps: curO.fps, base: curO.base, pts: curO.pts })};`,
    `const CURSOR_A = ${JSON.stringify({ fps: curA.fps, base: curA.base, pts: curA.pts })};`,
  ].join("\n      "));
html = html.replace(/__C_(\w+)__/g, (_, k) => String(C[k]));
html = html.replace(/__([A-Z0-9_]+)__/g, (m, k) => (k in T ? String(T[k]) : m));
if (/__[A-Za-z0-9_]+__/.test(html)) throw Error("unfilled placeholder: " + html.match(/__[A-Za-z0-9_]+__/)[0]);
fs.writeFileSync("index.html", html);

// ---------- sound design cues ----------
const sfx = [];
const add = (type, t, o = {}) => sfx.push({ type, t: r3(t), ...o });
for (const c of CHIPS) {
  add("tick", c.t0, { pitch: c.buy ? 1900 + c.price * 8 : 1500 + c.price * 6, gain: 0.08 });
  add("blip", c.t1 + 0.14, { pitch: 300 + (c.price - 96) * 22, gain: 0.07 });
}
add("thock", C.decisions, { gain: 0.32 });
add("shimmer", C.decisions + 0.05, { gain: 0.05 });
add("whoosh", C.p2 - 0.55, { dur: 0.6, up: true, gain: 0.18 });
add("sub", C.p2, { gain: 0.28 });
add("whoosh", C.apart - 0.1, { dur: 1.1, up: false, gain: 0.1 });
add("slide", C.apart + 0.1, { gain: 0.06 });
add("lock", C.trades, { gain: 0.16 });
add("whoosh", C.p3 - 0.45, { dur: 0.45, up: true, gain: 0.08 });
TILES.forEach((t, i) => add("tick", C.p3 + 0.05 + i * 0.03, { pitch: 2400 + (i % 6) * 160, gain: 0.045 }));
add("thock", C.p3, { gain: 0.22 });
for (let i = 0; i < 6; i++) add("clock", C.thirty + i * 0.16, { gain: 0.06 });
add("swell", C.one, { dur: 0.9, gain: 0.07 });
add("whoosh", C.time, { dur: C.pause - C.time, up: true, gain: 0.14 });
add("click", C.pause, { gain: 0.3 });
add("tapestop", C.pause + 0.02, { gain: 0.12 });
add("rewind", C.scrub + 0.08, { dur: 0.95, gain: 0.12 });
add("click", C.scrub, { gain: 0.16 });
add("whoosh", C.watch - 0.1, { dur: 0.5, up: false, gain: 0.08 });
add("lock", C.wall, { gain: 0.14 });
add("rumble", C.absorb, { dur: C.give - C.absorb, gain: 0.12 });
add("impact", C.give, { gain: 0.42 });
add("whoosh", C.give, { dur: 0.6, up: false, gain: 0.16 });
add("whoosh", C.real - 0.1, { dur: 0.6, up: true, gain: 0.07 });
for (let s = 0; s < 40; s++) {
  const t = C.replayed + ((C.until - C.replayed) * s) / 40;
  add("tick", t, { pitch: s % 5 === 0 ? 2100 : 2700, gain: s % 5 === 0 ? 0.06 : 0.03 });
}
EVID.forEach((e, i) => add("card", e.t, { gain: 0.12, pitch: 520 + i * 80 }));
add("slide", C.lines - 0.08, { gain: 0.1 });
EVID.forEach((e, i) => add("ping", C.up + 0.08 + i * 0.1, { pitch: [784, 988, 1175, 1568][i], gain: 0.09 }));
add("shimmer", C.up + 0.45, { gain: 0.06 });
add("drone", C.and, { dur: C.step - C.and + 0.3, gain: 0.1 });
add("lock", C.test - 0.4, { gain: 0.1 });
add("whoosh", C.step, { dur: 0.75, up: true, gain: 0.2 });
add("impact", C.flow, { gain: 0.5 });
add("sub", C.flow, { gain: 0.3 });
add("whoosh", C.mb - 0.5, { dur: 0.6, up: false, gain: 0.08 });
add("shimmer", C.mb, { gain: 0.07 });
add("thock", C.academy - 0.1, { gain: 0.2 });
add("click", C.market + 0.5, { gain: 0.08 });
fs.writeFileSync("assets/audio/sfx.json", JSON.stringify({ end: T.END, off: C.every, sfx }, null, 0));
console.log(`index.html ${T.END}s · ${CHIPS.length} chips · ${TILES.length} tiles (hero ${HERO}) · ${sfx.length} sound cues`);
