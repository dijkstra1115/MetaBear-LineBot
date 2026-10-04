// Builds index.html and assets/audio/cues.json from one edit decision list.
// Gameplay shots are cut from the captured videos (assets/video/*.mp4 + *.json): each shot picks a
// source range and a constant playback rate, so a run of adjacent shots with different rates reads as a
// speed ramp while source time stays continuous. Overlays (type, UI callouts) are hand-authored
// sub-compositions in compositions/ and are mounted here by section.
// Usage: node scripts/build.mjs
import fs from "node:fs";

const BPM = 128;
const B = 60 / BPM; // beat
const BAR = 4 * B;
const at = (bar, beat = 0) => +(bar * BAR + beat * B).toFixed(5);
const DUR = at(24);

const SRC = {
  main: { file: "assets/video/main.mp4", log: JSON.parse(fs.readFileSync("assets/video/main.json", "utf8")) },
  reveal: { file: "assets/video/reveal.mp4", log: JSON.parse(fs.readFileSync("assets/video/reveal.json", "utf8")) },
  ranked: { file: "assets/video/ranked.mp4", log: JSON.parse(fs.readFileSync("assets/video/ranked.json", "utf8")) },
  rewind: { file: "assets/video/rewind.mp4", log: null },
};

// Crops in page pixels (1920x1080 page = video frame): centre and zoom.
const WIDE = { cx: 960, cy: 540, z: 1 };
const STAGE = { cx: 928, cy: 600, z: 1.38 };
const C = {
  chartTop: { cx: 900, cy: 330, z: 1.9 },
  bands: { cx: 820, cy: 300, z: 2.5 },
  fuelRadar: { cx: 150, cy: 225, z: 3.1 },
  ticket: { cx: 1740, cy: 300, z: 2.7 },
  sizes: { cx: 1745, cy: 278, z: 3.6 },
  levBuy: { cx: 1740, cy: 400, z: 2.9 },
  runBtn: { cx: 1800, cy: 107, z: 3.4 },
  runBtnTight: { cx: 1811, cy: 107, z: 5.2 },
  meter: { cx: 760, cy: 250, z: 2.6 },
  hudPnl: { cx: 400, cy: 255, z: 3.0 },
  edge: { cx: 1390, cy: 330, z: 2.2 },
  burst: { cx: 950, cy: 500, z: 1.9 },
  report: { cx: 931, cy: 615, z: 2.0 },
  revealMap: { cx: 1180, cy: 470, z: 1.7 },
  rankedBanner: { cx: 928, cy: 620, z: 1.6 },
  scorebar: { cx: 760, cy: 75, z: 2.4 },
};

// Shot list. src: source key; from: source start (s); start/end: composition time; crop: [from, to] or one;
// ease for the camera move; panel: [x, y, w, h] for split screens; sfx: whether events in it make sound.
const S = [];
const shot = (o) => S.push({ src: "main", sfx: true, cursor: true, ease: "power2.inOut", ...o });

// ---- COLD OPEN (bars 0–2): straight into the cascade, a cut on every beat
shot({ id: "o1", start: at(0), end: at(0, 1), from: 10.62, rate: 0.55, crop: [{ ...STAGE, z: 1.55 }, { ...STAGE, z: 1.45 }], sfx: false, ease: "power3.out" });
shot({ id: "o2", start: at(0, 1), end: at(0, 2), from: 8.95, rate: 0.6, crop: [C.edge, { ...C.edge, z: 2.0 }], sfx: false });
shot({ id: "o3", start: at(0, 2), end: at(0, 3), from: 11.0, rate: 0.5, crop: [C.meter, { ...C.meter, z: 2.3 }], sfx: false, cursor: false });
shot({ id: "o4", start: at(0, 3), end: at(1), from: 12.6, rate: 0.6, crop: [C.hudPnl, { ...C.hudPnl, z: 2.7 }], sfx: false, cursor: false });
shot({ id: "o5", start: at(1), end: at(1, 2), from: 11.25, rate: 0.55, crop: [{ ...WIDE, z: 1.06 }, STAGE], sfx: false, ease: "power2.in" });
shot({ id: "o6", start: at(1, 2), end: at(2), from: 13.05, rate: 0.5, crop: [STAGE, { ...STAGE, z: 1.7 }], sfx: false, ease: "power1.in" });
// rewind: the whole run reversed into two beats
shot({ id: "rw", src: "rewind", start: at(2), end: at(2, 2), from: 0, rate: 1, crop: [WIDE, WIDE], sfx: false, cursor: false });
// ---- TITLE (bar 2 beat 2 – bar 4): the quiet planning screen under the title
shot({ id: "t1", start: at(2, 2), end: at(4), from: 0.0, rate: 0.12, crop: [{ ...STAGE, z: 1.2 }, { ...STAGE, z: 1.32 }], sfx: false, cursor: false, ease: "none", dim: true });
// ---- 01 READ (bars 4–7)
shot({ id: "r1", start: at(4), end: at(5), from: 0.15, rate: 0.75, crop: [{ ...STAGE, z: 1.25 }, C.chartTop] });
shot({ id: "r2", start: at(5), end: at(6), from: 1.56, rate: 0.75, crop: [C.chartTop, C.bands], ease: "power1.inOut" });
shot({ id: "r3", start: at(6), end: at(7), from: 2.97, rate: 0.75, crop: [{ ...C.fuelRadar, z: 2.6 }, C.fuelRadar] });
// ---- 02 LOAD (bars 7–10)
shot({ id: "l1", start: at(7), end: at(8), from: 4.2, rate: 2.0 / BAR, crop: [{ ...C.sizes, z: 3.0 }, C.sizes] });
shot({ id: "l2", start: at(8), end: at(9), from: 6.2, rate: 1.7 / BAR, crop: [C.levBuy, { ...C.levBuy, z: 3.2 }] });
shot({ id: "l3", start: at(9), end: at(9, 3), from: 7.9, rate: 0.85 / (3 * B), crop: [{ ...C.runBtn, z: 2.4 }, C.runBtn], ease: "power2.in" });
shot({ id: "l4", start: at(9, 3), end: at(10), from: 8.75, rate: 0.1, crop: [C.runBtn, C.runBtnTight], ease: "expo.out" });
// ---- 03 IGNITE (bars 10–16)
shot({ id: "i1", start: at(10), end: at(10, 2), from: 8.797, rate: 0.55, crop: [{ ...WIDE, z: 1.12 }, { ...STAGE, z: 1.3 }], ease: "expo.out" });
shot({ id: "i2", start: at(10, 2), end: at(11, 2), from: 9.31, rate: 0.7, crop: [STAGE, { ...STAGE, cx: 1000, z: 1.6 }] });
// split screen: three crops of the same instant
shot({ id: "i3a", start: at(11, 2), end: at(12, 2), from: 10.62, rate: 0.37, crop: [{ ...C.meter, z: 2.2 }, C.meter], panel: [0, 0, 640, 1080], sfx: true, cursor: false });
shot({ id: "i3b", start: at(11, 2), end: at(12, 2), from: 10.621, rate: 0.37, crop: [{ ...C.edge, z: 1.8 }, C.edge], panel: [640, 0, 640, 1080], sfx: false, cursor: false });
shot({ id: "i3c", start: at(11, 2), end: at(12, 2), from: 10.622, rate: 0.37, crop: [{ ...C.hudPnl, z: 2.5 }, C.hudPnl], panel: [1280, 0, 640, 1080], sfx: false, cursor: false });
shot({ id: "i4", start: at(12, 2), end: at(13, 2), from: 11.32, rate: 0.9, crop: [{ ...WIDE, z: 1.05 }, STAGE] });
shot({ id: "i5", start: at(13, 2), end: at(14, 2), from: 13.0, rate: 0.3, crop: [STAGE, { ...C.hudPnl, z: 2.2 }], ease: "power2.inOut" });
shot({ id: "i6", start: at(14, 2), end: at(16), from: 13.56, rate: 0.71 / (6 * B), crop: [{ ...STAGE, z: 1.2 }, { cx: 1500, cy: 640, z: 1.8 }], ease: "power2.in" });
// ---- 04 CASH OUT (bars 16–19)
shot({ id: "c1", start: at(16), end: at(17), from: 14.27, rate: 0.4, crop: [{ ...C.burst, z: 1.5 }, C.burst], ease: "expo.out" });
shot({ id: "c2", start: at(17), end: at(18), from: 15.02, rate: 1.4, crop: [STAGE, { ...STAGE, cx: 1050, z: 1.5 }] });
shot({ id: "c3", start: at(18), end: at(19), from: 19.6, rate: 1.5, crop: [{ ...C.report, z: 1.75 }, C.report], cursor: false });
// ---- 05 COMPETE (bars 19–21)
shot({ id: "p1", src: "reveal", start: at(19), end: at(20), from: 0.45, rate: 1.35, crop: [{ ...C.revealMap, z: 1.35 }, C.revealMap] });
shot({ id: "p2", src: "ranked", start: at(20), end: at(21), from: 0.15, rate: 0.93, crop: [{ ...C.rankedBanner, z: 1.35 }, C.rankedBanner], cursor: false });
// ---- CTA (bars 21–24): the cascade again, pushed back under the lockup
shot({ id: "e1", start: at(21), end: DUR, from: 9.6, rate: 0.42, crop: [{ ...STAGE, z: 1.5 }, { ...STAGE, z: 1.15 }], sfx: false, cursor: false, ease: "power1.out", dim: true });

// Section overlays (sub-compositions) and their windows.
const OVERLAYS = [
  { id: "ov-open", start: 0, end: at(2, 2) },
  { id: "ov-title", start: at(2, 2), end: at(4) },
  { id: "ov-read", start: at(4), end: at(7) },
  { id: "ov-load", start: at(7), end: at(10) },
  { id: "ov-ignite", start: at(10), end: at(16) },
  { id: "ov-cash", start: at(16), end: at(19) },
  { id: "ov-compete", start: at(19), end: at(21) },
  { id: "ov-cta", start: at(21), end: DUR },
];

// Hits: flash + shake + chromatic split + speed lines. Strength 0..1.
const HITS = [
  [at(0), 1], [at(0, 1), 0.5], [at(0, 2), 0.5], [at(0, 3), 0.5], [at(1), 0.8], [at(1, 2), 0.6],
  [at(2, 2), 1], [at(4), 0.5], [at(7), 0.5], [at(9, 3), 0.7], [at(10), 1], [at(10, 2), 0.6], [at(11, 2), 0.9],
  [at(12, 2), 0.7], [at(13, 2), 0.8], [at(16), 1], [at(17), 0.6], [at(18), 0.5], [at(19), 0.6], [at(20), 0.6],
  [at(21), 0.9], [at(23), 1],
];
// Whip transitions at these cuts (the outgoing and incoming shots smear sideways).
const WHIPS = [at(5), at(6), at(8), at(9), at(17), at(18), at(20)];

// ---------- helpers ----------
const clampCam = ({ cx, cy, z }) => {
  let x = 960 - cx * z;
  let y = 540 - cy * z;
  x = Math.min(0, Math.max(1920 - 1920 * z, x));
  y = Math.min(0, Math.max(1080 - 1080 * z, y));
  return { x: +x.toFixed(1), y: +y.toFixed(1), scale: +z.toFixed(4) };
};
const srcAt = (s, t) => s.from + (t - s.start) * s.rate;

// cursor samples per shot, in composition time
const cursorTrack = (s) => {
  const log = SRC[s.src].log;
  if (!log || !s.cursor) return null;
  const out = [];
  const step = 1 / 60;
  for (let t = s.start; t <= s.end + 1e-6; t += step) {
    const src = srcAt(s, t);
    const i = Math.min(log.frames.length - 1, Math.max(0, Math.round(src * log.fps)));
    const f = log.frames[i];
    out.push([+f.x.toFixed(1), +f.y.toFixed(1)]);
  }
  return out;
};

// map source events into composition cues
const cues = [];
const ripples = [];
for (const s of S) {
  const log = SRC[s.src].log;
  if (!log || !s.sfx) continue;
  const s0 = s.from, s1 = srcAt(s, s.end);
  for (const e of log.events) {
    if (e.t < s0 || e.t >= s1) continue;
    const t = +(s.start + (e.t - s0) / s.rate).toFixed(4);
    if (e.ev === "click") {
      cues.push({ t, type: "click", tag: e.tag });
      if (s.cursor) {
        const f = log.frames[Math.round(e.t * log.fps)];
        ripples.push({ shot: s.id, t, x: f.x, y: f.y });
      }
    } else if (e.ev === "hover") cues.push({ t, type: "hover", tag: e.tag });
    else if (e.ev === "key") cues.push({ t, type: "click", tag: e.tag });
  }
  // cascade waves: each new count is a wave tick, pitch climbs with the count
  let last = null;
  for (let t = s.start; t < s.end; t += 1 / 60) {
    const f = log.frames[Math.min(log.frames.length - 1, Math.round(srcAt(s, t) * log.fps))];
    const n = f.cascade ? Number(String(f.cascade).replace(/[^\d]/g, "")) : 0;
    if (n && n !== last && (last == null || n > last)) cues.push({ t: +t.toFixed(4), type: "wave", n, side: (f.eq ?? 0) > 0 && f.pos ? "short" : "long" });
    last = n || last;
    if (!n) last = null;
  }
}
for (const [t, k] of HITS) cues.push({ t, type: "hit", k });
for (const t of WHIPS) cues.push({ t, type: "whip" });
cues.sort((a, b) => a.t - b.t);

// ---------- HTML ----------
const fmt = (n) => +n.toFixed(4);
const videoHtml = [];
const js = [];
let track = 1;
for (const s of S) {
  const src = SRC[s.src];
  const dur = fmt(s.end - s.start);
  const panel = s.panel ? ` style="clip-path: inset(${s.panel[1]}px ${1920 - s.panel[0] - s.panel[2]}px ${1080 - s.panel[1] - s.panel[3]}px ${s.panel[0]}px)"` : "";
  const cur = cursorTrack(s);
  videoHtml.push(`        <div class="cam" id="cam-${s.id}"${panel}>
          <div class="cam-in" id="camin-${s.id}" data-layout-allow-overflow>
            <video id="v-${s.id}" class="clip shot${s.dim ? " dim" : ""}" src="${src.file}" muted playsinline data-start="${fmt(s.start)}" data-duration="${dur}" data-media-start="${fmt(s.from)}" data-playback-rate="${fmt(s.rate)}" data-track-index="${track}"></video>
${cur ? `            <div id="cur-${s.id}" class="clip cursor" data-start="${fmt(s.start)}" data-duration="${dur}" data-track-index="${track + 1}"></div>\n` : ""}${ripples.filter((r) => r.shot === s.id).map((r, j) => `            <div id="rip-${s.id}-${j}" class="ripple" style="left:${r.x}px;top:${r.y}px"></div>\n`).join("")}          </div>
        </div>`);
  const [c0, c1] = Array.isArray(s.crop) ? s.crop : [s.crop, s.crop];
  js.push(`tl.fromTo("#camin-${s.id}", ${JSON.stringify(clampCam(c0))}, { ...${JSON.stringify(clampCam(c1))}, duration: ${dur}, ease: "${s.ease}" }, ${fmt(s.start)});`);
  if (cur) js.push(`cursor("${s.id}", ${fmt(s.start)}, ${dur}, ${JSON.stringify(cur)});`);
  ripples.filter((r) => r.shot === s.id).forEach((r, j) => js.push(`ripple("#rip-${s.id}-${j}", ${r.t});`));
  track += 2;
}
for (const t of WHIPS) {
  const out = S.find((s) => Math.abs(s.end - t) < 1e-4 && !s.panel);
  const inn = S.find((s) => Math.abs(s.start - t) < 1e-4 && !s.panel);
  if (out) js.push(`whip("#cam-${out.id}", ${fmt(t)}, -1, true);`);
  if (inn) js.push(`whip("#cam-${inn.id}", ${fmt(t)}, -1, false);`);
}
js.push(`HITS.forEach(([t, k]) => hit(t, k));`);

const overlayHtml = OVERLAYS.map((o, i) => `      <div id="${o.id}" class="layer" data-composition-id="${o.id}" data-composition-src="compositions/${o.id}.html" data-start="${fmt(o.start)}" data-duration="${fmt(o.end - o.start)}" data-track-index="${100 + i}" data-width="1920" data-height="1080"></div>`).join("\n");
const audio = fs.existsSync("assets/audio/soundtrack.wav")
  ? `      <audio id="soundtrack" src="assets/audio/soundtrack.wav" data-start="0" data-duration="${DUR}" data-track-index="200" data-volume="1"></audio>\n`
  : "";

const html = `<!doctype html>
<html lang="zh-Hant">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=1920, height=1080" />
    <script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js"></script>
    <style>
      * {
        margin: 0;
        padding: 0;
        box-sizing: border-box;
      }
      html,
      body {
        margin: 0;
        width: 1920px;
        height: 1080px;
        overflow: hidden;
        background: #04070b;
      }
      #root {
        position: relative;
        width: 100%;
        height: 100%;
        overflow: hidden;
        background: #04070b;
      }
      #rig {
        position: absolute;
        inset: 0;
        overflow: hidden;
      }
      #rig-shake {
        position: absolute;
        inset: 0;
      }
      .cam {
        position: absolute;
        inset: 0;
        overflow: hidden;
      }
      .cam-in {
        position: absolute;
        left: 0;
        top: 0;
        width: 1920px;
        height: 1080px;
        transform-origin: 0 0;
      }
      video.shot {
        position: absolute;
        left: 0;
        top: 0;
        width: 1920px;
        height: 1080px;
        object-fit: cover;
        filter: contrast(1.08) saturate(1.18);
      }
      video.shot.dim {
        filter: contrast(1.05) saturate(1.1) brightness(0.55) blur(3px);
      }
      .cursor {
        filter: drop-shadow(0 0 7px rgba(255, 215, 122, 0.6)) drop-shadow(0 2px 3px rgba(0, 0, 0, 0.8));
        position: absolute;
        left: 0;
        top: 0;
        width: 30px;
        height: 30px;
        transform-origin: 6px 3px;
      }
      .cursor::before,
      .cursor::after {
        content: "";
        position: absolute;
        left: 0;
        top: 0;
        width: 30px;
        height: 30px;
        clip-path: polygon(20% 9%, 20% 78%, 38% 61%, 50% 89%, 61% 84%, 49% 57%, 73% 57%);
      }
      .cursor::before {
        background: #0a0f16;
        transform: scale(1.28);
        transform-origin: 20% 9%;
      }
      .cursor::after {
        background: #fdfaf2;
      }
      .ripple {
        position: absolute;
        width: 0;
        height: 0;
        opacity: 0;
      }
      .ripple::before,
      .ripple::after {
        content: "";
        position: absolute;
        left: -40px;
        top: -40px;
        width: 80px;
        height: 80px;
        border-radius: 50%;
        border: 3px solid #ffd77a;
        box-shadow: 0 0 18px #ffd77a;
      }
      .ripple::after {
        left: -12px;
        top: -12px;
        width: 24px;
        height: 24px;
        border: 0;
        background: #ffd77a;
        opacity: 0.8;
      }
      .layer {
        position: absolute;
        inset: 0;
      }
      #seams {
        position: absolute;
        left: 640px;
        top: 0;
        width: 640px;
        height: 1080px;
        border-left: 4px solid #04070b;
        border-right: 4px solid #04070b;
        opacity: 0;
        box-shadow: inset 0 0 0 1px rgba(255, 215, 122, 0.25);
      }
    </style>
  </head>
  <body>
    <div id="root" data-composition-id="main" data-start="0" data-duration="${DUR}" data-width="1920" data-height="1080">
      <svg width="0" height="0" style="position: absolute" aria-hidden="true">
        <filter id="rgb-split" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB">
          <feColorMatrix in="SourceGraphic" type="matrix" values="1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0" result="r" />
          <feOffset id="rgb-r" in="r" dx="0" dy="0" result="ro" />
          <feColorMatrix in="SourceGraphic" type="matrix" values="0 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 1 0" result="gb" />
          <feOffset id="rgb-gb" in="gb" dx="0" dy="0" result="gbo" />
          <feBlend in="ro" in2="gbo" mode="screen" />
        </filter>
      </svg>
      <div id="rig">
        <div id="rig-shake">
${videoHtml.join("\n")}
        </div>
        <div id="seams" data-layout-ignore></div>
      </div>
${overlayHtml}
      <div id="fx-overlay" class="layer" data-composition-id="fx-overlay" data-composition-src="compositions/fx-overlay.html" data-start="0" data-duration="${DUR}" data-track-index="150" data-width="1920" data-height="1080"></div>
${audio}    </div>
    <script>
      const tl = gsap.timeline({ paused: true });
      const HITS = ${JSON.stringify(HITS)};
      // cursor: sampled page positions at 60 per second; counter-scaled so it reads the same size at any zoom
      const cursor = (id, start, dur, pts) => {
        const el = document.getElementById("cur-" + id);
        const cam = document.getElementById("camin-" + id);
        const p = { v: 0 };
        const place = () => {
          const f = p.v * (pts.length - 1);
          const i = Math.min(pts.length - 2, Math.floor(f));
          const k = f - i;
          const a = pts[i], b = pts[i + 1] || a;
          const z = gsap.getProperty(cam, "scale") || 1;
          el.style.transform = "translate(" + (a[0] + (b[0] - a[0]) * k - 6) + "px," + (a[1] + (b[1] - a[1]) * k - 3) + "px) scale(" + (1.25 / z).toFixed(4) + ")";
        };
        place();
        tl.to(p, { v: 1, duration: dur, ease: "none", onUpdate: place }, start);
      };
      const ripple = (sel, t) => {
        tl.fromTo(sel, { opacity: 1, scale: 0.3 }, { opacity: 0, scale: 1.6, duration: 0.45, ease: "power2.out", immediateRender: false }, t);
      };
      // whip: smear the outgoing shot off and the incoming shot on
      const whip = (sel, t, dir, out) => {
        if (out) tl.fromTo(sel, { x: 0, filter: "blur(0px)" }, { x: dir * 420, filter: "blur(18px)", duration: 0.1, ease: "power2.in", immediateRender: false }, t - 0.1);
        else tl.fromTo(sel, { x: -dir * 420, filter: "blur(18px)" }, { x: 0, filter: "blur(0px)", duration: 0.14, ease: "power3.out", immediateRender: false }, t);
      };
      // hit: camera shake and a chromatic split that decays fast
      const rgbR = document.getElementById("rgb-r");
      const rgbG = document.getElementById("rgb-gb");
      const hit = (t, k) => {
        const amp = 26 * k;
        const shake = gsap.timeline();
        [[1, -0.6], [-0.8, 0.9], [0.6, -0.4], [-0.3, 0.3], [0, 0]].forEach(([x, y], i) => shake.to("#rig-shake", { x: x * amp * (1 - i * 0.18), y: y * amp * (1 - i * 0.18), duration: 0.035, ease: "none" }));
        tl.add(shake, t);
        const split = { v: 0 };
        tl.fromTo(split, { v: 18 * k }, { v: 0, duration: 0.28, ease: "power2.out", immediateRender: false, onStart: () => {}, onUpdate: () => {
          rgbR.setAttribute("dx", split.v.toFixed(2));
          rgbG.setAttribute("dx", (-split.v).toFixed(2));
          document.getElementById("rig").style.filter = split.v > 0.05 ? "url(#rgb-split)" : "none";
        } }, t);
      };
      ${js.join("\n      ")}
      tl.fromTo("#seams", { opacity: 0 }, { opacity: 1, duration: 0.01 }, ${at(11, 2)});
      tl.to("#seams", { opacity: 0, duration: 0.01 }, ${at(12, 2)});
      window.__timelines["main"] = tl;
    </script>
  </body>
</html>
`;
fs.writeFileSync("index.html", html);
fs.mkdirSync("assets/audio", { recursive: true });
fs.writeFileSync("assets/audio/cues.json", JSON.stringify({ bpm: BPM, duration: DUR, cues }, null, 1));
console.log(`index.html: ${S.length} shots, ${DUR}s; ${cues.length} cues`);

// ---------- overlays: inject the shared kit, CSS and per-shot game data between markers ----------
const DATA = {};
for (const s of S) {
  const log = SRC[s.src].log;
  if (!log || s.panel && s.id !== "i3a") continue;
  const rows = [];
  for (let t = s.start; t <= s.end + 1e-6; t += 0.05) {
    const f = log.frames[Math.min(log.frames.length - 1, Math.max(0, Math.round(srcAt(s, t) * log.fps)))];
    rows.push([Math.round(f.price), f.eq, f.cascade ? Number(String(f.cascade).replace(/[^\d]/g, "")) : 0]);
  }
  DATA[s.id] = { s: fmt(s.start), e: fmt(s.end), r: rows };
}
const KIT_CSS = fs.readFileSync("scripts/kit.css", "utf8").trim();
const KIT_JS = fs.readFileSync("scripts/kit.js", "utf8").trim();
const between = (text, tag, body) => {
  const a = `/* @${tag}:start */`, b = `/* @${tag}:end */`;
  const i = text.indexOf(a), j = text.indexOf(b);
  return i < 0 || j < 0 ? text : text.slice(0, i + a.length) + "\n" + body + "\n" + text.slice(j);
};
for (const f of fs.readdirSync("compositions").filter((f) => /^(ov-|fx-).*\.html$/.test(f))) {
  const p = `compositions/${f}`;
  let text = fs.readFileSync(p, "utf8");
  text = between(text, "kitcss", KIT_CSS);
  text = between(text, "kit", KIT_JS);
  text = between(text, "data", `const DATA = ${JSON.stringify(DATA)};`);
  text = between(text, "hits", `const HITS = ${JSON.stringify(HITS)};`);
  fs.writeFileSync(p, text);
}
console.log("overlays injected");
