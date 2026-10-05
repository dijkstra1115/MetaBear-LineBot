// Builds index.html from the edit: shots (real captures, retimed onto the beat grid), virtual camera moves,
// redrawn cursors, kinetic type and hit effects. Also writes assets/audio/cues.json for scripts/music.mjs.
// Usage: node scripts/build.mjs
import fs from "node:fs";
import { beat as n, bar, P, END, SILENT, DROP } from "./grid.mjs";

const W = 1920;
const H = 1080;
const r4 = (x) => +x.toFixed(4);
const log = (name) => JSON.parse(fs.readFileSync(`assets/video/${name}.json`, "utf8"));
const LOGS = { open: log("open"), end: log("end"), map: log("map"), main: log("main"), reveal: log("reveal") };
const OPEN = LOGS.open.boxes;

// ---------- shots ----------
// seg: [src, start, end, mediaStart, rate]; cam keys: [t, focusX, focusY, zoom, dur, ease] in page pixels.
const seg = (src, start, end, m0, rate = 1) => ({ src, start: r4(start), end: r4(end), m0: r4(m0), rate: r4(rate) });
const full = { l: 0, t: 0, w: W, h: H };
const SHOTS = [
  // A · the interactive moment: click play on a real lesson, drag the playhead back, then the riser bar.
  {
    id: "a", box: full, cursor: "open",
    segs: [seg("open", 0, bar(3), 0.235)],
    cam: [
      [0, OPEN.play.cx, OPEN.play.cy, 2.6],
      [n(0) + 0.03, 1116, 600, 1.12, 0.9, "expo.out"],
      [n(4), 760, 900, 2.1],
      [n(6), 1050, 480, 1.45, 0.55, "power3.inOut"],
      [n(7), 1050, 480, 1.52, 0.6, "sine.inOut"],
      [n(8), 1000, 580, 1.5],
      [n(8) + 0.01, 1050, 600, 1.9, 2.38, "power2.in"],
    ],
  },
  // B · hands-on: FLOW ARENA order, execute, cascade. Speed-ramped so every click lands on a beat.
  {
    id: "b", box: full, cursor: "main",
    segs: [
      seg("main", bar(3), n(14), 5.6 - P * 1.0833, 1.0833),
      seg("main", n(14), n(15), 6.25, (7.65 - 6.25) / P),
      seg("main", n(15), n(16), 7.65, (8.75 - 7.65) / P),
      seg("main", n(16), n(20), 8.75, 1),
      seg("main", n(20), n(24), 8.75 + 4 * P, 1.25),
    ],
    cam: [
      [bar(3), 1740, 300, 2.3],
      [n(13), 1760, 300, 2.45, 0.35, "power2.out"],
      [n(14), 1745, 380, 2.45, 0.3, "power3.out"],
      [n(15), 1760, 250, 2.2, 0.45, "power3.inOut"],
      [n(16) + 0.08, 1000, 560, 1.12, 0.45, "expo.inOut"],
      [n(17), 1150, 480, 1.3, 1.7, "sine.inOut"],
      [n(20), 1250, 450, 1.55],
      [n(20) + 0.01, 1300, 420, 1.78, 2.38, "none"],
    ],
  },
  // C · real-time feedback: the reveal lays the true liquidations, stops and targets over the chart.
  {
    id: "c", box: full, cursor: "reveal",
    segs: [
      seg("reveal", n(24), n(26), 0.45, 1),
      seg("reveal", n(26), n(27), 0.45 + 2 * P, 0.1),
      seg("reveal", n(27), n(28), 0.45 + 2 * P + 0.1 * P, 1.5),
    ],
    cam: [
      [n(24), 928, 560, 1.18],
      [n(24) + 0.05, 1100, 520, 1.35, 1.1, "power2.out"],
      [n(26), 1300, 470, 1.85],
      [n(27), 1000, 560, 1.2, 0.5, "expo.out"],
    ],
  },
  // D · lessons answer back: evidence cards light up.
  { id: "d1", box: { l: 760, t: 200, w: 1080, h: 608 }, cls: "screen", segs: [seg("m-trend", n(28), n(30), 0.75)], cam: [[n(28), 960, 540, 1.0], [n(28) + 0.01, 960, 520, 1.12, 1.18, "sine.out"]] },
  { id: "d2", box: { l: 80, t: 200, w: 1080, h: 608 }, cls: "screen", segs: [seg("m-sr", n(30), n(32), 0.05)], cam: [[n(30), 960, 540, 1.0], [n(30) + 0.01, 900, 500, 1.12, 1.18, "sine.out"]] },
  // 2×2 wall, one tile per beat
  { id: "g1", box: { l: 48, t: 22, w: 900, h: 506 }, cls: "screen tile", segs: [seg("m-liq", n(32), n(36), 0.0)], cam: [[n(32), 960, 540, 1.0]] },
  { id: "g2", box: { l: 972, t: 22, w: 900, h: 506 }, cls: "screen tile", segs: [seg("m-wall", n(33), n(36), 0.2)], cam: [[n(33), 960, 540, 1.0]] },
  { id: "g3", box: { l: 48, t: 552, w: 900, h: 506 }, cls: "screen tile", segs: [seg("m-flip", n(34), n(36), 0.0)], cam: [[n(34), 960, 540, 1.0]] },
  { id: "g4", box: { l: 972, t: 552, w: 900, h: 506 }, cls: "screen tile", segs: [seg("m-rewind", n(35), n(36), 0.2)], cam: [[n(35), 960, 540, 1.0]] },
  // the learning map in a tilted screen
  {
    id: "m", box: { l: 90, t: 170, w: 1120, h: 630 }, cls: "screen tilt", cursor: "map",
    segs: [seg("map", n(36), n(39), 0.3, (2.7 - 0.3) / (3 * P)), seg("map", n(39), n(40), 4.15, 1)],
    cam: [[n(36), 960, 540, 1.0], [n(36) + 0.01, 900, 500, 1.08, 1.8, "sine.inOut"], [n(39), 960, 520, 1.0]],
  },
  // build: half-beat cuts through six lessons
  ...["m-heat", "m-fib", "m-fp", "m-trend", "m-flip", "m-liq"].map((src, i) => ({
    id: `k${i}`, box: full,
    segs: [seg(src, n(40 + i / 2), n(40 + (i + 1) / 2), [0.5, 0.5, 0.5, 1.6, 0.2, 0.2][i])],
    cam: [[n(40 + i / 2), 960, 540, 1.05], [n(40 + i / 2) + 0.01, 960 + (i % 2 ? 80 : -80), 520, 1.05 + 0.04 * (i + 1), P / 2, "none"]],
  })),
  // the silent beat and the drop: the real end screen of the lesson
  {
    id: "e", box: full, cursor: "end",
    segs: [seg("end", SILENT, DROP, 2.0, 1.2), seg("end", DROP, n(45), 2.0 + 1.2 * P, 0.6)],
    cam: [[SILENT, 1116, 600, 1.75], [SILENT + 0.01, 1116, 600, 1.85, P, "none"], [DROP, 1116, 600, 1.9], [DROP + 0.01, 1116, 590, 1.3, 0.5, "expo.out"]],
  },
  // achievements: the turn report and ranked mode
  { id: "f", box: full, cls: "flip", cursor: "main", segs: [seg("main", n(45), n(46), 20.0, 0.6)], cam: [[n(45), 928, 625, 2.0], [n(45) + 0.01, 928, 615, 2.15, P, "power2.out"]] },
  { id: "h", box: full, segs: [seg("ranked", n(46), n(47), 0.25, 1)], cam: [[n(46), 880, 620, 1.75], [n(46) + 0.01, 880, 620, 1.5, P, "expo.out"]] },
  // the wall: everything the academy is, at once, then it recedes behind the lockup
  ...[
    ["m-trend", 0], ["m-sr", 0], ["m-liq", 0],
    ["m-wall", 0], ["main", 10.5], ["m-heat", 0],
    ["m-fib", 0], ["m-fp", 0], ["open", 3.6],
  ].map(([src, m0], i) => {
    const col = i % 3, row = Math.floor(i / 3);
    return {
      id: `w${i}`, box: { l: 48 + col * 612, t: 21 + row * 350, w: 600, h: 338 }, cls: "screen wall",
      segs: [seg(src, n(47), END, m0, src.startsWith("m-") ? 0.95 : 1)],
      cam: [[n(47), 960, 540, 1.0]],
    };
  }),
];

// ---------- cursors and clicks ----------
const cursorData = {};
const ripples = [];
const clicks = [];
for (const s of SHOTS) {
  if (!s.cursor) continue;
  const L = LOGS[s.cursor];
  const fps = L.fps;
  let lo = Infinity, hi = -Infinity;
  for (const g of s.segs) {
    const m1 = g.m0 + (g.end - g.start) * g.rate;
    lo = Math.min(lo, g.m0);
    hi = Math.max(hi, m1);
    for (const ev of L.events) {
      if (ev.ev !== "click" && ev.ev !== "down") continue;
      if (ev.t < g.m0 - 1e-6 || ev.t >= m1 - 1e-6) continue;
      const t = g.start + (ev.t - g.m0) / g.rate;
      const fr = L.frames[Math.min(L.frames.length - 1, Math.round(ev.t * fps))];
      ripples.push({ cam: s.id, t: r4(t), x: ev.x ?? fr.x, y: ev.y ?? fr.y });
      clicks.push({ t: r4(t), gain: ev.ev === "down" ? 0.14 : 0.24, pitch: ev.ev === "down" ? 1700 : 2600 });
    }
  }
  const base = Math.max(0, Math.floor(lo * fps) - 2);
  const top = Math.min(L.frames.length - 1, Math.ceil(hi * fps) + 2);
  const pts = [];
  for (let i = base; i <= top; i++) pts.push([+L.frames[i].x.toFixed(1), +L.frames[i].y.toFixed(1)]);
  cursorData[s.id] = { fps, base, pts };
}
// the drop is a click on "next lesson"
const endHover = LOGS.end.frames[LOGS.end.frames.length - 1];
ripples.push({ cam: "e", t: r4(DROP), x: endHover.x, y: endHover.y });

// ---------- HTML ----------
let track = 1;
const camHtml = (s) => {
  const fit = s.box.w / W;
  const vids = s.segs
    .map((g, i) => `<video id="v-${s.id}-${i}" class="clip shot" src="assets/video/${g.src}.mp4" muted playsinline data-start="${g.start}" data-duration="${r4(g.end - g.start)}" data-media-start="${g.m0}" data-playback-rate="${g.rate}" data-track-index="${track++}"></video>`)
    .join("\n              ");
  const cur = cursorData[s.id] ? `\n              <div id="cur-${s.id}" class="cursor"></div>` : "";
  const rip = ripples
    .filter((r) => r.cam === s.id)
    .map((r, i) => `\n              <div id="rip-${s.id}-${i}" class="ripple" style="left:${r.x}px;top:${r.y}px"></div>`)
    .join("");
  return `
        <div class="cam ${s.cls ?? ""}" id="cam-${s.id}" style="left:${s.box.l}px;top:${s.box.t}px;width:${s.box.w}px;height:${s.box.h}px;">
          <div class="cam-fit" style="transform: scale(${fit.toFixed(5)})">
            <div class="cam-in" id="camin-${s.id}" data-layout-allow-overflow>
              ${vids}${cur}${rip}
            </div>
          </div>
        </div>`;
};

// overlays: [id, start, end, inner html, extra class]
const OV = [];
const ov = (id, start, end, html, cls = "") => OV.push({ id, start: r4(start), end: r4(end), html, cls });

ov("o-a1", 0, n(4), `<div class="scrim scrim-bl"></div>
          <div class="stack bl"><div class="kicker" id="a1k">METABEAR 互動學院 · ORDERFLOW ACADEMY</div><div class="big" id="a1a">按下播放，</div><div class="big accent" id="a1b">市場動起來。</div></div>`);
ov("o-a2", n(4), n(8), `<div class="scrim scrim-tr"></div>
          <div class="stack tr"><div class="big" id="a2a">拖回去，</div><div class="big accent" id="a2b">再看一次。</div><div class="chip" id="a2c"><i class="dot"></i>隨時暫停 · 回拖 · 跳章節</div></div>`);
ov("o-a3", n(8), bar(3), `<div class="giant-row">${["換", "你", "動", "手"].map((c, i) => `<span class="giant${i === 3 ? " accent" : ""}" id="a3-${i}">${c}</span>`).join("")}</div>
          <div class="mono-tag" id="a3t">YOUR MOVE · 動手挑戰</div>`);
ov("o-b1", bar(3), n(16), `<div class="scrim scrim-l"></div>
          <div class="stack ml"><div class="kicker" id="b1k">CHALLENGE · FLOW ARENA 沙盤</div><div class="big" id="b1a">親手</div><div class="big accent" id="b1b">下單。</div>
          <div class="chips"><div class="chip" id="b1c0"><b>數量</b>5,000 BTC</div><div class="chip" id="b1c1"><b>槓桿</b>5×</div><div class="chip buy" id="b1c2"><b>買入 · 做多</b><span class="key">Q</span></div></div></div>`);
ov("o-b2", n(16), n(20), `<div class="scrim scrim-bl"></div>
          <div class="chip run tl-chip" id="b2c"><span class="key">SPACE</span>執行回合</div>
          <div class="stack bl"><div class="big" id="b2a">一張單，</div><div class="big accent" id="b2b">推動整個市場。</div></div>`);
ov("o-b3", n(20), n(24), `<div class="ghost" id="b3g">CASCADE</div><div class="scrim scrim-bl"></div>
          <div class="stack bl"><div class="kicker kicker-gap" id="b3k">你引爆的強平</div><div class="count" id="b3n"><span id="b3v">0</span><small>BTC</small></div></div>`);
ov("o-c1", n(24), n(28), `<div class="scrim scrim-l"></div>
          <div class="chip tl-chip" id="c1c"><span class="key">R</span>揭曉 · 練習對答案</div>
          <div class="ghost ghost-c" id="c1g">FEEDBACK</div>
          <div class="stack ml"><div class="big" id="c1a">立刻</div><div class="big accent" id="c1b">對答案。</div><div class="sub" id="c1s">真實的強平、止損、止盈，全部攤開。</div></div>`);
ov("o-d1", n(28), n(30), `<div class="stack side-l"><div class="kicker" id="d1k">LESSON · 回調縮量，才是上車點</div><div class="big" id="d1a">每個證據，</div><div class="sub" id="d1s">四個條件，逐一亮起。</div></div>`);
ov("o-d2", n(30), n(32), `<div class="stack side-r"><div class="kicker" id="d2k">LESSON · 同一道支撐，守住或翻轉</div><div class="big accent" id="d2a">當場確認。</div><div class="sub" id="d2s">對了，就知道為什麼對。</div></div>`);
const tiles = [["g1", "合約強平"], ["g2", "真實盤面上的訂單塊"], ["g3", "同一道支撐，守住或翻轉"], ["g4", "倒回去，再看一次"]];
tiles.forEach(([g, label], i) => {
  const s = SHOTS.find((x) => x.id === g);
  ov(`o-${g}`, n(32 + i), n(36), `<div class="tile-label" id="${g}l" style="left:${s.box.l + 24}px;top:${s.box.t + s.box.h - 78}px">${label}</div>`);
});
ov("o-m", n(36), n(40), `<div class="stats">
            <div class="stat-hero" id="m0"><span class="num" id="m0v">0</span><span class="unit">堂動態課程</span></div>
            <div class="stat" id="m1"><span class="num">14</span><span class="unit">名詞圖解</span></div>
            <div class="stat" id="m2"><span class="num">6</span><span class="unit">市場故事</span></div>
            <div class="stat" id="m3"><span class="num">3</span><span class="unit">策略實戰</span></div>
            <div class="sub" id="m4">每堂約 30 秒，只講一件事。</div>
          </div>`);
["熱力圖", "黃金口袋", "足跡圖", "回調縮量", "守住或翻轉", "合約強平"].forEach((t, i) =>
  ov(`o-k${i}`, n(40 + i / 2), n(40 + (i + 1) / 2), `<div class="flash-title${i % 2 ? " right" : ""}" id="k${i}t"><small>${String(i + 1).padStart(2, "0")} / 23</small>${t}</div>`),
);
ov("o-prog", n(40), DROP, `<div class="prog"><div class="prog-track"><i id="progf"></i></div><span id="progv">0%</span></div>`);
ov("o-e", DROP, n(45), `<div class="done" id="ed"><span class="done-tc" id="ed1">本課完成</span><svg class="done-check" id="ed2" viewBox="0 0 250 250" aria-hidden="true"><circle cx="125" cy="125" r="112" fill="rgba(120,225,213,0.14)" stroke="#78e1d5" stroke-width="10" /><polyline points="70,130 108,168 182,88" fill="none" stroke="#78e1d5" stroke-width="22" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="260" /></svg></div><div class="mono-tag low" id="edt">LESSON COMPLETE</div>`);
ov("o-f", n(45), n(46), `<div class="chip tl-chip" id="fc"><i class="dot"></i>回合結算 · 教練點評</div>`);
ov("o-h", n(46), n(47), `<div class="scrim scrim-bl"></div><div class="stack bl"><div class="big" id="ha">排名賽</div><div class="sub big-sub" id="hs">24 回合，比總損益。</div></div>`);
ov("o-w", n(47), n(48), `<div class="center-word" id="wa">再來一局。</div>`);
ov("o-end", n(48), END, `<div class="lockup">
            <img class="badge" id="lb" src="assets/img/badge.png" alt="" />
            <div class="lock-title" id="lt">互動學院</div>
            <div class="lock-mono" id="lm">METABEAR · ORDERFLOW ACADEMY</div>
            <div class="lock-tag" id="lg">看見過程，才讀得懂市場。</div>
            <div class="lock-url" id="lu">metabear.io/orderflow</div>
          </div>
          <div class="disclaimer" id="ldis">課程為交易概念教學，不提供個人買賣建議或獲利保證；FLOW ARENA 為模擬市場。</div>`);

const ovHtml = OV.map((o) => `
        <div class="clip ov ${o.cls}" id="${o.id}" data-start="${o.start}" data-duration="${r4(o.end - o.start)}" data-track-index="${100 + OV.indexOf(o)}">
          ${o.html}
        </div>`).join("");

const camsHtml = SHOTS.map(camHtml).join("");
const shotsJs = JSON.stringify(SHOTS.map((s) => ({ id: s.id, start: Math.min(...s.segs.map((g) => g.start)), end: Math.max(...s.segs.map((g) => g.end)), cam: s.cam, segs: s.segs, cursor: !!s.cursor })));
const ripJs = JSON.stringify(ripples.map((r) => ({ cam: r.cam, t: r.t, i: ripples.filter((x) => x.cam === r.cam).indexOf(r) })));

const template = fs.readFileSync("scripts/template.html", "utf8");
const html = template
  .replace("/*__DURATION__*/", String(r4(END)))
  .replace("<!--__CAMS__-->", camsHtml)
  .replace("<!--__OVERLAYS__-->", ovHtml)
  .replace("/*__DATA__*/", `const SHOTS = ${shotsJs};\n      const CURSORS = ${JSON.stringify(cursorData)};\n      const RIPPLES = ${ripJs};\n      const GRID = ${JSON.stringify({ T0: n(0), P, END: r4(END), SILENT: r4(SILENT), DROP: r4(DROP) })};`)
  .replace(/__DURATION__/g, String(r4(END)));
fs.writeFileSync("index.html", html);
fs.mkdirSync("assets/audio", { recursive: true });
fs.writeFileSync("assets/audio/cues.json", JSON.stringify({ duration: r4(END), clicks: clicks.sort((a, b) => a.t - b.t) }, null, 1));
console.log(`index.html: ${SHOTS.length} shots, ${SHOTS.reduce((a, s) => a + s.segs.length, 0)} video clips, ${OV.length} overlays, ${ripples.length} ripples; ${END.toFixed(3)} s`);
