// FLOW ARENA "surge" 9:16: the vertical cut of the music film on "Raya (Sped Up)".
// Same song edit, beats and footage as ../surge; framing, cards and type are re-laid for 1080x1920.
// One edit list builds index.html (paper world, footage screens, crops, speed steps, cursor), injects
// the shared kit into compositions/ov-*.html, and writes the cue sheet scripts/music.mjs mixes from.
// The song is cut: bars 0–15 as they are, then a splice straight into the drop at song bar 20, so the
// breakdown (film bars 12–15) releases into the biggest hit of the track on film bar 16.
// Usage: node scripts/build.mjs
import fs from "node:fs";

const BPM = 116.55;
const B = 60 / BPM;
const BAR = 4 * B;
const T0 = 0.5; // first downbeat in the song (and the film)
const at = (bar, beat = 0) => +(T0 + bar * BAR + beat * B).toFixed(4);
const DROP = at(16);
const DUR = 53.5;
// music edit: film time → song time
const SPLICE_OUT = 33.44, SPLICE_IN = 41.677;

const SRC = {};
for (const k of ["main", "reveal", "ranked", "short", "wall"]) {
  SRC[k] = { file: `assets/video/${k}.mp4`, log: JSON.parse(fs.readFileSync(`assets/video/${k}.json`, "utf8")) };
}

// Frame and framing. Full-bleed crops use { cx, cy, z } in source-page pixels, where z is output pixels
// per page pixel (1.78 shows the full page height). Cards are 16:9 windows whose crops work as in ../surge.
const FW = 1080, FH = 1920;
const P = (cx, cy, z) => ({ cx, cy, z });
const SCR = {
  hero: { x: 40, y: 470, w: 1000, ry: 0, rx: 0 },
  g1: { x: 90, y: 250, w: 900, ry: 10, rx: 6 },
  g2: { x: 90, y: 560, w: 900, ry: -10, rx: 6 },
  g3: { x: 90, y: 870, w: 900, ry: 10, rx: 6 },
  g4: { x: 90, y: 1180, w: 900, ry: -10, rx: 6 },
  low: { x: 50, y: 900, w: 980, ry: -12, rx: 4 },
  high: { x: 50, y: 330, w: 980, ry: 12, rx: 4 },
  center: { x: 40, y: 560, w: 1000, ry: 0, rx: 0 },
  // full-frame slices: a clip shape and the point in the frame the crop centres on
  top: { full: true, clip: "polygon(0 0, 100% 0, 100% 44%, 0 56%)", fx: 540, fy: 480 },
  bottom: { full: true, clip: "polygon(0 56%, 100% 44%, 100% 100%, 0 100%)", fx: 540, fy: 1440 },
  b1: { full: true, clip: "inset(0 0 calc(66.67% + 5px) 0)", fx: 540, fy: 317 },
  b2: { full: true, clip: "inset(calc(33.33% + 5px) 0 calc(33.33% + 5px) 0)", fx: 540, fy: 960 },
  b3: { full: true, clip: "inset(calc(66.67% + 5px) 0 0 0)", fx: 540, fy: 1603 },
};

// Card crops (16:9 card space, as in ../surge)
const STAGE = { cx: 928, cy: 600, z: 1.38 };
const C = {
  chartTop: { cx: 900, cy: 330, z: 1.8 },
  ticket: { cx: 1740, cy: 330, z: 2.4 },
  report: { cx: 931, cy: 615, z: 1.9 },
  revealMap: { cx: 1180, cy: 470, z: 1.6 },
  ranked: { cx: 928, cy: 620, z: 1.5 },
};

const S = [];
const shot = (o) => S.push({ src: "main", sfx: true, cursor: true, ease: "power2.inOut", ...o });

// 0 · pickup and intro hit: straight into the cascade, framed on the push beam
shot({ id: "a0", start: 0, end: at(0), from: 10.35, rate: 0.5, crop: [P(1300, 560, 2.3), P(1300, 560, 2.05)], cursor: false, sfx: false, ease: "power3.in" });
shot({ id: "a1", start: at(0), end: at(0, 2), from: 10.6, rate: 0.55, crop: [P(1250, 600, 1.85), P(1300, 580, 2.05)], sfx: false, cursor: false, ease: "expo.out" });
shot({ id: "a2", start: at(0, 2), end: at(1), from: 12.9, rate: 0.5, crop: [P(420, 265, 3.6), P(420, 265, 3.2)], sfx: false, cursor: false });
// 1 · the paper world; the cascade becomes a card under the title
shot({ id: "b1", start: at(1), end: at(2), from: 11.2, rate: 0.35, crop: [STAGE, STAGE], screen: "hero", enter: "settle", sfx: false, cursor: false, ease: "none" });
// 2–3 · a deck of four cards, one per beat
shot({ id: "g1", start: at(2), end: at(4), from: 0.6, rate: 0.6, crop: [{ ...C.chartTop, z: 1.5 }, C.chartTop], screen: "g1", enter: "pop", sfx: false, cursor: false });
shot({ id: "g2", start: at(2, 1), end: at(4), from: 4.3, rate: 0.6, crop: [C.ticket, C.ticket], screen: "g2", enter: "pop", sfx: false });
shot({ id: "g3", src: "reveal", start: at(2, 2), end: at(4), from: 0.9, rate: 0.6, crop: [C.revealMap, C.revealMap], screen: "g3", enter: "pop", sfx: false, cursor: false });
shot({ id: "g4", start: at(2, 3), end: at(4), from: 10.9, rate: 0.4, crop: [STAGE, STAGE], screen: "g4", enter: "pop", sfx: false, cursor: false });
// 4–5 · READ: type on top, the chart card below
shot({ id: "r1", start: at(4), end: at(6), from: 0.15, rate: 3.4 / (2 * BAR), crop: [{ ...STAGE, z: 1.2 }, { ...C.chartTop, z: 2.0 }], screen: "low", enter: "slide-r" });
// 6–7 · SIZE: 5,000 with the order ticket inside the numerals, then the ticket card
shot({ id: "s1", start: at(6), end: at(7), from: 4.2, rate: 1.4 / BAR, crop: [P(1745, 300, 3.0), P(1745, 290, 3.4)], knock: "5,000", sfx: true });
shot({ id: "s2", start: at(7), end: at(8), from: 5.6, rate: 2.2 / BAR, crop: [C.ticket, { ...C.ticket, z: 2.7 }], screen: "high", enter: "slide-l" });
// 8–9 · the crowd pushes back
shot({ id: "w1", src: "wall", start: at(8), end: at(10), from: 2.7, rate: 4.3 / (2 * BAR), crop: [{ ...STAGE, z: 1.2 }, { ...STAGE, cx: 1000, z: 1.6 }], screen: "center", enter: "zoom" });
// 10–11 · both ways: long on top, the dump after the close below
shot({ id: "x1", start: at(10), end: at(12), from: 9.4, rate: 0.6, crop: [P(1300, 560, 1.7), P(1300, 560, 1.9)], screen: "top", enter: "wipe-l", cursor: false });
shot({ id: "x2", start: at(10), end: at(12), from: 14.35, rate: 0.8, crop: [P(1300, 600, 1.7), P(1300, 600, 1.9)], screen: "bottom", enter: "wipe-r", cursor: false, sfx: false });
// 12–15 · BREAKDOWN: grey, slow; a short is queued; execute
shot({ id: "k1", start: at(12), end: at(13), from: 0.2, rate: 0.12, crop: [P(1000, 600, 1.85), P(1000, 600, 1.98)], gray: true, cursor: false, sfx: false, ease: "none" });
shot({ id: "k2", src: "reveal", start: at(13), end: at(14), from: 0.5, rate: 0.9, crop: [P(1250, 470, 1.95), P(1250, 470, 2.2)], gray: "violet", sfx: false });
shot({ id: "k3", src: "short", start: at(14), end: at(15), from: 0.55, rate: 1.65 / BAR, crop: [P(1740, 360, 3.2), P(1740, 360, 3.45)], gray: true });
shot({ id: "k4", src: "short", start: at(15), end: at(15, 3), from: 2.2, rate: 0.75 / (3 * B), crop: [P(1780, 220, 3.0), P(1800, 160, 3.4)], gray: true, ease: "power2.in" });
shot({ id: "k5", src: "short", start: at(15, 3), end: DROP, from: 2.95, rate: 0.1, crop: [P(1811, 120, 3.4), P(1811, 110, 5.0)], gray: true, ease: "expo.out" });
// 16–21 · DROP: the short ignites a LIQUIDATION STORM (seed 19)
shot({ id: "d1", src: "short", start: DROP, end: at(16, 2), from: 2.98, rate: 0.55, crop: [P(1300, 560, 1.8), P(1320, 560, 2.0)], tiles: 3, ease: "expo.out", cursor: false });
shot({ id: "d2", src: "short", start: at(16, 2), end: at(17, 2), from: 3.55, rate: 0.95 / BAR, crop: [P(1300, 560, 1.85), P(1400, 560, 2.1)], cursor: false });
shot({ id: "d3a", src: "short", start: at(17, 2), end: at(18, 2), from: 4.5, rate: 0.4, crop: [P(928, 300, 2.3), P(928, 300, 2.6)], screen: "b1", enter: "slice-l", cursor: false });
shot({ id: "d3b", src: "short", start: at(17, 2), end: at(18, 2), from: 4.504, rate: 0.4, crop: [P(1390, 400, 1.9), P(1390, 400, 2.1)], screen: "b2", enter: "slice-r", sfx: false, cursor: false });
shot({ id: "d3c", src: "short", start: at(17, 2), end: at(18, 2), from: 4.508, rate: 0.4, crop: [P(425, 270, 3.0), P(425, 270, 3.3)], screen: "b3", enter: "slice-l", sfx: false, cursor: false });
shot({ id: "d4", src: "short", start: at(18, 2), end: at(19, 2), from: 5.3, rate: 0.45, crop: [P(1150, 600, 1.8), P(1200, 600, 2.0)], cursor: false });
shot({ id: "d5", src: "short", start: at(19, 2), end: at(20, 2), from: 6.85, rate: 0.3, crop: [P(1250, 560, 1.9), P(1300, 560, 2.2)], cursor: false });
shot({ id: "d6", src: "short", start: at(20, 2), end: at(22), from: 7.47, rate: 0.9 / (6 * B), crop: [P(1350, 620, 1.9), P(1650, 700, 2.4)], ease: "power2.in" });
// 22 · cash out, and the market snaps back without you
shot({ id: "c1", src: "short", start: at(22), end: at(22, 2), from: 8.37, rate: 0.42, crop: [P(950, 500, 1.55), P(950, 500, 1.68)], ease: "expo.out" });
shot({ id: "c2", src: "short", start: at(22, 2), end: at(23), from: 8.9, rate: 2.0, crop: [P(1300, 560, 1.85), P(1380, 560, 2.0)], cursor: false });
// 23 · round report, ranked
shot({ id: "e1", src: "short", start: at(23), end: at(23, 2), from: 14.7, rate: 1.4, crop: [{ ...C.report, z: 1.7 }, C.report], screen: "center", enter: "pop", cursor: false });
shot({ id: "e2", src: "ranked", start: at(23, 2), end: at(24), from: 0.3, rate: 1.4, crop: [C.ranked, { ...C.ranked, z: 1.65 }], screen: "center", enter: "cut", cursor: false });
// 24 · the lockup on paper; the last card falls away
shot({ id: "z1", start: at(24), end: DUR, from: 10.0, rate: 0.3, crop: [STAGE, { ...STAGE, z: 1.5 }], screen: "hero", enter: "settle-out", sfx: false, cursor: false, ease: "power1.out" });

const OVERLAYS = [
  { id: "ov-intro", start: 0, end: at(4) },
  { id: "ov-play", start: at(4), end: at(12) },
  { id: "ov-hold", start: at(12), end: DROP },
  { id: "ov-drop", start: DROP, end: at(22) },
  { id: "ov-out", start: at(22), end: DUR },
];
// Paper is visible while shots are screens; ink darkens it for the breakdown.
const PAPER = [
  [0, 0], [at(1), 1], [at(10), 1], [at(12), 1], [DROP, 0], [at(23), 0], [at(23) + 0.01, 1],
];
const HITS = [
  [at(0), 1], [at(1), 0.6], [at(2), 0.3], [at(4), 0.5], [at(6), 0.6], [at(8), 0.6], [at(10), 0.6],
  [at(12), 0.4], [DROP, 1], [at(16, 2), 0.5], [at(17, 2), 0.7], [at(18, 2), 0.6], [at(19, 2), 0.7], [at(22), 0.9], [at(24), 1],
];
const WHIPS = [at(22, 2)];

// ---------- helpers ----------
const fmt = (n) => +n.toFixed(4);
// card crops live in 1920x1080 card space; full-frame crops in the 1080x1920 frame
const clampCam = ({ cx, cy, z }, frame) => {
  if (!frame) {
    let x = 960 - cx * z, y = 540 - cy * z;
    x = Math.min(0, Math.max(1920 - 1920 * z, x));
    y = Math.min(0, Math.max(1080 - 1080 * z, y));
    return { x: +x.toFixed(1), y: +y.toFixed(1), scale: +z.toFixed(4) };
  }
  let x = (frame.fx ?? FW / 2) - cx * z, y = (frame.fy ?? FH / 2) - cy * z;
  // a slice only shows its own band, so it may frame past the edge of the source
  if (frame.fx == null) {
    x = Math.min(0, Math.max(FW - 1920 * z, x));
    y = Math.min(0, Math.max(FH - 1080 * z, y));
  }
  return { x: +x.toFixed(1), y: +y.toFixed(1), scale: +z.toFixed(4) };
};
const srcAt = (s, t) => s.from + (t - s.start) * s.rate;

const cursorTrack = (s) => {
  const log = SRC[s.src].log;
  if (!s.cursor) return null;
  const out = [];
  for (let t = s.start; t <= s.end + 1e-6; t += 1 / 60) {
    const f = log.frames[Math.min(log.frames.length - 1, Math.max(0, Math.round(srcAt(s, t) * log.fps)))];
    out.push([+f.x.toFixed(1), +f.y.toFixed(1)]);
  }
  return out;
};

const cues = [];
const ripples = [];
for (const s of S) {
  const log = SRC[s.src].log;
  if (!s.sfx) continue;
  const s0 = s.from, s1 = srcAt(s, s.end);
  for (const e of log.events) {
    if (e.t < s0 || e.t >= s1 || e.ev !== "click") continue;
    const t = fmt(s.start + (e.t - s0) / s.rate);
    cues.push({ t, type: "click", tag: e.tag });
    if (s.cursor) {
      const f = log.frames[Math.round(e.t * log.fps)];
      ripples.push({ shot: s.id, t, x: f.x, y: f.y });
    }
  }
}
for (const [t, k] of HITS) cues.push({ t, type: "hit", k });
for (const t of WHIPS) cues.push({ t, type: "whip" });
cues.push({ t: at(15, 3), type: "freeze" }, { t: DROP, type: "drop" }, { t: at(24), type: "final" });
cues.sort((a, b) => a.t - b.t);

// ---------- HTML ----------
const html = [];
const js = [];
let track = 1;
const screenCss = (sc) => (sc.full ? `left:0;top:0;width:${FW}px;height:${FH}px;clip-path:${sc.clip};` : `left:${sc.x}px;top:${sc.y}px;width:${sc.w}px;height:${Math.round((sc.w * 9) / 16)}px;`);
for (const s of S) {
  const src = SRC[s.src];
  const dur = fmt(s.end - s.start);
  const sc = s.screen ? SCR[s.screen] : null;
  const cur = cursorTrack(s);
  const card = sc && !sc.full;
  const fit = card ? sc.w / 1920 : 1;
  const tiles = s.tiles || 1;
  const cells = [];
  for (let i = 0; i < tiles * tiles; i++) cells.push(i);
  for (const i of cells) {
    const id = tiles > 1 ? `${s.id}-${i}` : s.id;
    const cx = i % tiles, cy = Math.floor(i / tiles);
    const tileClip = tiles > 1 ? `clip-path: inset(${(cy * FH) / tiles}px ${FW - ((cx + 1) * FW) / tiles}px ${FH - ((cy + 1) * FH) / tiles}px ${(cx * FW) / tiles}px);` : "";
    const cls = ["cam", card ? "screen" : "", sc && sc.full ? "split" : "", s.gray === true ? "gray" : "", s.gray === "violet" ? "violet" : "", s.knock ? "knocked" : ""].filter(Boolean).join(" ");
    const style = sc ? screenCss(sc) : `left:0;top:0;width:${FW}px;height:${FH}px;${tileClip}`;
    const media = fmt(s.from + (tiles > 1 ? i * 0.003 : 0));
    html.push(`        <div class="${cls}" id="cam-${id}" style="${style}">
          <div class="cam-fit" style="transform: scale(${fit.toFixed(5)})">
            <div class="cam-in" id="camin-${id}" data-layout-allow-overflow>
              <video id="v-${id}" class="clip shot" src="${src.file}" muted playsinline data-start="${fmt(s.start)}" data-duration="${dur}" data-media-start="${media}" data-playback-rate="${fmt(s.rate)}" data-track-index="${track}"></video>
${cur && i === 0 ? `              <div id="cur-${s.id}" class="clip cursor" data-start="${fmt(s.start)}" data-duration="${dur}" data-track-index="${track + 1}"></div>\n` : ""}${i === 0 ? ripples.filter((r) => r.shot === s.id).map((r, j) => `              <div id="rip-${s.id}-${j}" class="ripple" style="left:${r.x}px;top:${r.y}px"></div>\n`).join("") : ""}            </div>
          </div>
${s.knock ? `          <div class="clip knock" data-layout-allow-overlap id="knock-${s.id}" data-start="${fmt(s.start)}" data-duration="${dur}" data-track-index="${track + 1}"><span data-layout-allow-overlap>${s.knock}</span></div>\n` : ""}        </div>`);
    const [c0, c1] = Array.isArray(s.crop) ? s.crop : [s.crop, s.crop];
    const frame = card ? null : sc ? { fx: sc.fx, fy: sc.fy } : {};
    js.push(`tl.fromTo("#camin-${id}", ${JSON.stringify(clampCam(c0, frame))}, { ...${JSON.stringify(clampCam(c1, frame))}, duration: ${dur}, ease: "${s.ease}" }, ${fmt(s.start)});`);
    // a cam (and its shadow) only exists inside its shot's window
    js.push(`tl.set("#cam-${id}", { visibility: "visible" }, ${fmt(s.start)});`);
    js.push(`tl.set("#cam-${id}", { visibility: "hidden" }, ${fmt(s.end)});`);
    if (tiles > 1) {
      // each tile flies in from depth and locks into the grid
      const dx = (cx - (tiles - 1) / 2) * 200, dy = (cy - (tiles - 1) / 2) * 320;
      js.push(`tl.fromTo("#cam-${id}", { x: ${dx}, y: ${dy}, z: -900, rotationY: ${-dx / 14}, rotationX: ${dy / 14}, opacity: 0 }, { x: 0, y: 0, z: 0, rotationY: 0, rotationX: 0, opacity: 1, duration: 0.42, ease: "expo.out", delay: ${(((cx + cy) % 3) * 0.03).toFixed(2)} }, ${fmt(s.start)});`);
    }
  }
  if (sc) {
    const base = sc.full ? {} : { rotationY: sc.ry, rotationX: sc.rx };
    const enter = {
      pop: [{ scale: 0.6, opacity: 0, z: -400 }, { scale: 1, opacity: 1, z: 0, duration: 0.32, ease: "back.out(1.6)" }],
      pop3: [{ scale: 0.5, opacity: 0, z: -600, rotationY: sc.ry * 3 }, { scale: 1, opacity: 1, z: 0, rotationY: sc.ry, duration: 0.36, ease: "expo.out" }],
      "slide-r": [{ x: 900, opacity: 0, rotationY: sc.ry - 30 }, { x: 0, opacity: 1, rotationY: sc.ry, duration: 0.5, ease: "expo.out" }],
      "slide-l": [{ x: -900, opacity: 0, rotationY: sc.ry + 30 }, { x: 0, opacity: 1, rotationY: sc.ry, duration: 0.5, ease: "expo.out" }],
      zoom: [{ scale: 1.6, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.4, ease: "expo.out" }],
      settle: [{ scale: 1.28, y: -60 }, { scale: 1, y: 0, duration: 0.7, ease: "expo.out" }],
      "settle-out": [{ scale: 1, opacity: 1 }, { scale: 0.78, opacity: 0, duration: 0.6, ease: "expo.out" }],
      "wipe-l": [{ x: -1200 }, { x: 0, duration: 0.42, ease: "expo.out" }],
      "wipe-r": [{ x: 1200 }, { x: 0, duration: 0.42, ease: "expo.out" }],
      cut: [{ opacity: 1 }, { opacity: 1, duration: 0.01 }],
      "slice-l": [{ x: -1100 }, { x: 0, duration: 0.38, ease: "expo.out" }],
      "slice-r": [{ x: 1100 }, { x: 0, duration: 0.38, ease: "expo.out" }],
    }[s.enter || "cut"];
    js.push(`tl.fromTo("#cam-${s.id}", ${JSON.stringify({ ...base, ...enter[0] })}, ${JSON.stringify({ ...base, ...enter[1] })}, ${fmt(s.start)});`);
    // a slow drift while the screen is up keeps it alive
    const ed = enter[1].duration;
    if (!sc.full) js.push(`tl.to("#cam-${s.id}", { rotationY: ${sc.ry * 0.6}, duration: ${fmt(Math.max(0.1, dur - ed - 0.01))}, ease: "none" }, ${fmt(s.start + ed + 0.01)});`);
  }
  if (cur) js.push(`cursor("${s.id}", ${fmt(s.start)}, ${dur}, ${JSON.stringify(cur)});`);
  ripples.filter((r) => r.shot === s.id).forEach((r, j) => js.push(`ripple("#rip-${s.id}-${j}", ${r.t});`));
  if (s.knock) js.push(`tl.fromTo("#knock-${s.id} span", { scale: 1.25 }, { scale: 1, duration: ${dur}, ease: "power2.out" }, ${fmt(s.start)});`);
  track += 2;
}
for (const t of WHIPS) {
  const out = S.find((s) => Math.abs(s.end - t) < 1e-3);
  const inn = S.find((s) => Math.abs(s.start - t) < 1e-3);
  if (out) js.push(`whip("#cam-${out.id}", ${fmt(t)}, -1, true);`);
  if (inn) js.push(`whip("#cam-${inn.id}", ${fmt(t)}, -1, false);`);
}
PAPER.forEach(([t, v], i) => {
  if (!i) return;
  const [t0, v0] = PAPER[i - 1];
  if (v0 !== v) js.push(`tl.fromTo("#paper", { opacity: ${v0} }, { opacity: ${v}, duration: ${fmt(Math.max(0.01, Math.min(0.25, t - t0)))}, ease: "power2.out", immediateRender: false }, ${fmt(t - Math.min(0.25, t - t0))});`);
});
// the breakdown: ink floods the paper over bar 12, lifts on the drop
js.push(`tl.fromTo("#ink", { opacity: 0 }, { opacity: 1, duration: ${fmt(BAR)}, ease: "power1.inOut" }, ${at(12)});`);
js.push(`tl.to("#ink", { opacity: 0, duration: 0.01 }, ${DROP});`);
js.push(`HITS.forEach(([t, k]) => hit(t, k));`);

const overlayHtml = OVERLAYS.map((o, i) => `      <div id="${o.id}" class="layer" data-composition-id="${o.id}" data-composition-src="compositions/${o.id}.html" data-start="${fmt(o.start)}" data-duration="${fmt(o.end - o.start)}" data-track-index="${100 + i}" data-width="${FW}" data-height="${FH}"></div>`).join("\n");
const audio = fs.existsSync("assets/audio/soundtrack.wav") ? `      <audio id="soundtrack" src="assets/audio/soundtrack.wav" data-start="0" data-duration="${DUR}" data-track-index="200" data-volume="1"></audio>\n` : "";

const page = `<!doctype html>
<html lang="zh-Hant">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=1080, height=1920" />
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
        width: 1080px;
        height: 1920px;
        overflow: hidden;
        background: #0b0d10;
      }
      @font-face {
        font-family: "Noto Sans TC";
        src: url("assets/fonts/NotoSansTC-sub.ttf") format("truetype");
        font-weight: 100 900;
        font-display: block;
      }
      #root {
        position: relative;
        width: 100%;
        height: 100%;
        overflow: hidden;
        background: #0b0d10;
      }
      #paper {
        position: absolute;
        inset: 0;
        background-color: #ece8de;
        background-image: linear-gradient(rgba(20, 20, 20, 0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(20, 20, 20, 0.06) 1px, transparent 1px);
        background-size: 135px 135px;
        background-position: -1px -1px;
        opacity: 0;
      }
      #ink {
        position: absolute;
        inset: 0;
        background: radial-gradient(ellipse at 50% 50%, #15181d 0%, #07080a 100%);
        opacity: 0;
      }
      #rig {
        position: absolute;
        inset: 0;
        overflow: hidden;
        perspective: 1800px;
      }
      #rig-shake {
        position: absolute;
        inset: 0;
        transform-style: preserve-3d;
      }
      .cam {
        position: absolute;
        overflow: hidden;
        isolation: isolate;
        visibility: hidden;
      }
      .cam.screen {
        border-radius: 18px;
        box-shadow: 0 50px 90px rgba(10, 12, 16, 0.42), 0 10px 26px rgba(10, 12, 16, 0.35), 0 0 0 1px rgba(10, 12, 16, 0.25);
      }
      .cam-fit {
        position: absolute;
        left: 0;
        top: 0;
        width: 1920px;
        height: 1080px;
        transform-origin: 0 0;
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
        filter: contrast(1.08) saturate(1.2);
      }
      .cam.gray video.shot {
        filter: grayscale(1) contrast(1.15) brightness(0.8);
      }
      /* under a knockout, keep every channel below the paper so only the letters show footage */
      .cam.knocked video.shot {
        filter: contrast(1.05) saturate(1.1) brightness(0.78);
      }
      .cam.violet video.shot {
        filter: grayscale(0.75) contrast(1.15) brightness(0.9) hue-rotate(10deg);
      }
      .knock {
        position: absolute;
        left: 0;
        top: 0;
        width: 1080px;
        height: 1920px;
        display: flex;
        align-items: center;
        justify-content: center;
        background: #ece8de;
        mix-blend-mode: lighten;
      }
      .knock span {
        display: block;
        font: 900 410px "Noto Sans TC", sans-serif;
        letter-spacing: -0.06em;
        line-height: 1;
        color: #000;
        white-space: nowrap;
      }
      .cursor {
        position: absolute;
        left: 0;
        top: 0;
        width: 30px;
        height: 30px;
        transform-origin: 6px 3px;
        filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.7));
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
      .ripple::before {
        content: "";
        position: absolute;
        left: -44px;
        top: -44px;
        width: 88px;
        height: 88px;
        border-radius: 50%;
        border: 4px solid #2de2a6;
        box-shadow: 0 0 18px #2de2a6;
      }
      .layer {
        position: absolute;
        inset: 0;
      }
    </style>
  </head>
  <body>
    <div id="root" data-composition-id="main" data-start="0" data-duration="${DUR}" data-width="${FW}" data-height="${FH}">
      <svg width="0" height="0" style="position: absolute" aria-hidden="true">
        <filter id="rgb-split" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB">
          <feColorMatrix in="SourceGraphic" type="matrix" values="1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0" result="r" />
          <feOffset id="rgb-r" in="r" dx="0" dy="0" result="ro" />
          <feColorMatrix in="SourceGraphic" type="matrix" values="0 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 1 0" result="gb" />
          <feOffset id="rgb-gb" in="gb" dx="0" dy="0" result="gbo" />
          <feBlend in="ro" in2="gbo" mode="screen" />
        </filter>
      </svg>
      <div id="paper" data-layout-ignore></div>
      <div id="ink" data-layout-ignore></div>
      <div id="rig">
        <div id="rig-shake">
${html.join("\n")}
        </div>
      </div>
${overlayHtml}
      <div id="fx-overlay" class="layer" data-composition-id="fx-overlay" data-composition-src="compositions/fx-overlay.html" data-start="0" data-duration="${DUR}" data-track-index="150" data-width="${FW}" data-height="${FH}"></div>
${audio}    </div>
    <script>
      const tl = gsap.timeline({ paused: true });
      const HITS = ${JSON.stringify(HITS)};
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
      const whip = (sel, t, dir, out) => {
        if (out) tl.fromTo(sel, { x: 0, filter: "blur(0px)" }, { x: dir * 420, filter: "blur(18px)", duration: 0.1, ease: "power2.in", immediateRender: false }, t - 0.1);
        else tl.fromTo(sel, { x: -dir * 420, filter: "blur(18px)" }, { x: 0, filter: "blur(0px)", duration: 0.14, ease: "power3.out", immediateRender: false }, t);
      };
      const rgbR = document.getElementById("rgb-r");
      const rgbG = document.getElementById("rgb-gb");
      const hit = (t, k) => {
        const amp = 22 * k;
        const shake = gsap.timeline();
        [[1, -0.6], [-0.8, 0.9], [0.6, -0.4], [-0.3, 0.3], [0, 0]].forEach(([x, y], i) => shake.to("#rig-shake", { x: x * amp * (1 - i * 0.18), y: y * amp * (1 - i * 0.18), duration: 0.035, ease: "none" }));
        tl.add(shake, t);
        const split = { v: 0 };
        tl.fromTo(split, { v: 16 * k }, { v: 0, duration: 0.26, ease: "power2.out", immediateRender: false, onUpdate: () => {
          rgbR.setAttribute("dx", split.v.toFixed(2));
          rgbG.setAttribute("dx", (-split.v).toFixed(2));
          document.getElementById("rig").style.filter = split.v > 0.05 ? "url(#rgb-split)" : "none";
        } }, t);
      };
      ${js.join("\n      ")}
      window.__timelines["main"] = tl;
    </script>
  </body>
</html>
`;
fs.writeFileSync("index.html", page);

// ---------- overlays: shared kit, CSS and per-shot game data ----------
const DATA = {};
for (const s of S) {
  const log = SRC[s.src].log;
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
const GRID = Array.from({ length: 30 }, (_, k) => at(k));
for (const f of fs.readdirSync("compositions").filter((f) => /^(ov-|fx-).*\.html$/.test(f))) {
  const p = `compositions/${f}`;
  let text = fs.readFileSync(p, "utf8");
  text = between(text, "kitcss", KIT_CSS);
  text = between(text, "kit", KIT_JS);
  text = between(text, "data", `const DATA = ${JSON.stringify(DATA)};`);
  text = between(text, "hits", `const HITS = ${JSON.stringify(HITS)};`);
  text = between(text, "grid", `const BEAT = ${B}; const BARS = ${JSON.stringify(GRID)}; const DROP = ${DROP}; const DUR = ${DUR};`);
  fs.writeFileSync(p, text);
}
fs.mkdirSync("assets/audio", { recursive: true });
fs.writeFileSync("assets/audio/cues.json", JSON.stringify({ bpm: BPM, duration: DUR, splice: [SPLICE_OUT, SPLICE_IN], drop: DROP, bars: GRID, cues }, null, 1));
console.log(`index.html: ${S.length} shots, ${DUR}s, drop at ${DROP}s; ${cues.length} cues`);
