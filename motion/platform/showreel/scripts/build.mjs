// Writes index.html from template.html and scene-timeline.js, and assets/audio/cues.json (the hits
// and sections score.py reads). Run from this folder: node scripts/build.mjs
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "playwright";
import { FEATURES, HERO, RING, S } from "./cues.mjs";
import { TAPE } from "./lab-rig.mjs";
import { loadPlan } from "./take-plan.mjs";
import { centreOf, loadWall } from "./wall.mjs";

const read = (f) => readFileSync(`scripts/${f}`, "utf8");
const FF = process.env.FFMPEG || "ffmpeg";

const video = (id, src, start, d, media = 0, rate = 1) =>
  `<video id="v-${id}" class="clip" src="assets/video/${src}.mp4" muted playsinline data-start="${start}" data-duration="${d}" data-track-index="1" data-media-start="${media}"${rate !== 1 ? ` data-playback-rate="${rate}"` : ""}></video>`;
const screen = (id, src, start, d, media = 0, rate = 1) => `        <div id="scr-${id}" class="screen">${video(id, src, start, d, media, rate)}</div>`;

// ---------- the take: when things really happen on it, read off its own clock ----------
const plan = loadPlan();
const clock = JSON.parse(readFileSync(join(TAPE, "dive-log.json"), "utf8")).log.map(([f, text]) => {
  const [, h, m, s] = text.match(/(\d\d):(\d\d):(\d\d)/);
  return [f / 60, Date.parse(`2026-09-14T${h}:${m}:${s}+08:00`)];
});
const footage = (t) => {
  const hit = clock.find((c) => c[1] >= t);
  if (!hit) throw new Error(`take never reaches ${new Date(t).toISOString()}`);
  return hit[0];
};
// The target is the film's hinge: the take is placed so it lands exactly on S.tp.
const takeStart = S.tp - footage(plan.t4.touchAt);
const filmAt = (t) => takeStart + footage(t);
const taipei = (s) => Date.parse(`${s}+08:00`);
if (takeStart > 0) throw new Error("the take starts after the film does; record more footage before it");
const TAKE = {
  start: takeStart,
  t1Sig: filmAt(plan.t1.sig),
  t1Fill: filmAt(plan.t1.fill),
  t1Stop: filmAt(plan.t1.touchAt),
  t2Sig: filmAt(plan.t2.sig),
  t2Fill: filmAt(plan.t2.fill),
  t2Tp: filmAt(plan.t2.touchAt),
  t3Sig: filmAt(plan.t3.sig),
  t4Sig: filmAt(plan.t4.sig),
  full: filmAt(plan.t3.fill),
  fpCut: filmAt(taipei("2026-09-14T21:05:00")),
  stop: filmAt(plan.t3.touchAt),
  entry: filmAt(plan.t4.fill),
  zoomOut: filmAt(taipei("2026-09-14T21:12:00")),
};
console.log("take", Object.fromEntries(Object.entries(TAKE).map(([k, v]) => [k, +v.toFixed(3)])));

// ---------- the wall ----------
const wall = loadWall();
// Each tile is a real mini-chart: the bars around the trade and its box, baked to an image once. The
// render does not keep what a page draws on a canvas at load unless the canvas has its own layer.
function drawTile(w) {
  const canvas = document.createElement("canvas");
  canvas.width = 800;
  canvas.height = 450;
  const g = canvas.getContext("2d");
  g.fillStyle = "#0a1119";
  g.fillRect(0, 0, 800, 450);
  const W = 800, H = 450, x0 = 22, x1 = W - 22, y0 = 76, y1 = H - 20;
  let lo = Math.min(w.stop, w.tp), hi = Math.max(w.stop, w.tp);
  for (const b of w.bars) { lo = Math.min(lo, b[2]); hi = Math.max(hi, b[1]); }
  const pad = (hi - lo) * 0.05; lo -= pad; hi += pad;
  const X = (k) => x0 + ((k + 0.5) / w.bars.length) * (x1 - x0);
  const Y = (p) => y1 - ((p - lo) / (hi - lo)) * (y1 - y0);
  const bw = Math.max(3, ((x1 - x0) / w.bars.length) * 0.66);
  const a = X(w.i0), b = X(w.i1) + bw;
  g.fillStyle = "rgba(120,225,213,0.2)";
  g.fillRect(a, Math.min(Y(w.entry), Y(w.tp)), b - a, Math.abs(Y(w.tp) - Y(w.entry)));
  g.fillStyle = "rgba(240,154,90,0.22)";
  g.fillRect(a, Math.min(Y(w.entry), Y(w.stop)), b - a, Math.abs(Y(w.stop) - Y(w.entry)));
  g.strokeStyle = "rgba(237,242,237,0.75)";
  g.lineWidth = 2;
  g.beginPath(); g.moveTo(a, Y(w.entry)); g.lineTo(b, Y(w.entry)); g.stroke();
  w.bars.forEach((c, k) => {
    const col = c[3] >= c[0] ? "#78e1d5" : "#f09a5a", x = X(k);
    g.strokeStyle = g.fillStyle = col;
    g.beginPath(); g.moveTo(x, Y(c[1])); g.lineTo(x, Y(c[2])); g.stroke();
    g.fillRect(x - bw / 2, Math.min(Y(c[0]), Y(c[3])), bw, Math.max(2, Math.abs(Y(c[3]) - Y(c[0]))));
  });
  return canvas.toDataURL("image/png").split(",")[1];
}
mkdirSync("assets/video/wall", { recursive: true });
const painter = await chromium.launch();
const canvasPage = await painter.newPage();
for (const [i, w] of wall.entries()) writeFileSync(`assets/video/wall/${i}.png`, Buffer.from(await canvasPage.evaluate(drawTile, w), "base64"));
await painter.close();
const hero = { ...HERO, ...centreOf(HERO.col, HERO.row) };

const tiles = wall.map((w, i) => {
  const x = (w.col - 2.5) * 850 - 400, y = (w.row - 2) * 500 - 225;
  const inside = i === HERO.wall ? `<div id="tv${i}" class="tv">${video("dive", "dive", 0, S.rail, +(-takeStart).toFixed(4))}</div>` : "";
  return `            <div id="tile${i}" class="tile ${w.result}${inside ? " played" : ""}" style="left:${x}px;top:${y}px"><img src="assets/video/wall/${i}.png" alt="" />${inside}<div class="t-at">${w.at}</div><div class="t-res ${w.result}">${w.result === "tp" ? `+${w.r}R` : "−1R"}</div><div class="t-edge"></div></div>`;
});

// ---------- the screens ----------
const screens = [
  // The card opens at 1.1 s of the rail clip and ▶ 覆盤這段 is pressed at 3.2 s, where railA ends:
  // the press is on screen, and the replay runs on from it without a jump.
  screen("railA", "rail", S.rail, S.replayBtn - S.rail, 1.2),
  screen("railB", "rail", S.replayBtn, S.feat - S.replayBtn, 3.2, 3.3),
  ...FEATURES.map((f) => screen(f.id, f.id, f.at, f.d, f.media)),
];
const names = FEATURES.map((f, i) => (f.name ? `      <div id="fname${i}" class="txt lower"><span class="nm" data-split>${f.name}</span>${f.sub ? `<span class="sub">${f.sub}</span>` : ""}</div>` : ""));

// ---------- the ring: a still under each clip lights the dark before it starts to play ----------
mkdirSync("assets/video/fin", { recursive: true });
const still = (id, at) => {
  const file = `assets/video/fin/${id}-${at}.jpg`;
  if (!existsSync(file)) execFileSync(FF, ["-y", "-loglevel", "error", "-ss", String(at), "-i", `assets/video/${id}.mp4`, "-frames:v", "1", "-vf", "scale=1280:-1", "-q:v", "3", file]);
  return file;
};
const faces = (list, tier) =>
  list.map((f, i) => {
    const a = (i / list.length) * 360;
    const img = `<img src="${still(f.id, f.still ?? f.media)}" alt="" />`;
    const clip = f.still != null ? "" : video(`${tier}${i}`, f.id, S.ring, +(S.implode - S.ring + 0.6 + (tier === "t" ? 0 : 0.01) + i * 0.002).toFixed(3), f.media);
    return `              <div class="fin" style="transform: rotateY(${a}deg) translateZ(770px)">${img}${clip}<div class="plate">${f.name}</div></div>`;
  });

// Thuds in the dark, closing in on the drop.
const FLICKER = [0.85, 1.2, 1.45, 1.6, 1.68].map((d) => S.black + d);

const data = `      const S = ${JSON.stringify(S)};
      const TAKE = ${JSON.stringify(TAKE)};
      const WALL = ${JSON.stringify(wall.map(({ col, row }) => ({ col, row })))};
      const HERO = ${JSON.stringify(hero)};
      const FEATURES = ${JSON.stringify(FEATURES.map(({ id, at, d, on, from, to, name }) => ({ id, at, d, on, from, to, name })))};
      const FLICKER = ${JSON.stringify(FLICKER)};`;
const html = read("template.html")
  .replaceAll("{{END}}", String(S.end))
  .replace("{{TILES}}", tiles.join("\n"))
  .replace("{{SCREENS}}", screens.join("\n"))
  .replace("{{FINS_TOP}}", faces(RING.top, "t").join("\n"))
  .replace("{{FINS_BOT}}", faces(RING.bottom, "b").join("\n"))
  .replace("{{FEAT_NAMES}}", names.join("\n"))
  .replace("{{DATA}}", data)
  .replace("{{TIMELINE}}", read("scene-timeline.js"));
writeFileSync("index.html", html);

// ---------- hits ----------
const hits = [];
const hit = (t, k, o = {}) => hits.push({ t: Math.round(t * 1000) / 1000, k, ...o });
// One take: each signal climbs its layers, each fill is a chirp, each result a note on the beat, and
// the quiet hours a rush of air.
hit(TAKE.t1Sig, "signal", { n: plan.t1.stack.n });
hit(TAKE.t1Fill, "entry", { g: 0.6 });
hit(TAKE.t1Stop, "loss");
hit(TAKE.t2Sig, "signal", { n: plan.t2.stack.n });
hit(TAKE.t2Fill, "entry", { g: 0.7 });
hit(TAKE.t2Tp, "win");
hit(TAKE.t2Tp + 0.15, "whoosh", { d: 1.5, g: 0.32 });
hit(TAKE.t3Sig, "signal", { n: plan.t3.stack.n });
hit(S.hero, "whoosh", { d: 1, g: 0.26 }); // the chart zooms in on its own bars
hit(S.entry, "whoosh", { d: 1, g: 0.2 }); // and back out
hit(TAKE.t4Sig, "signal", { n: plan.t4.stack.n, g: 1.15 });
hit(TAKE.full, "entry", { g: 0.7 });
hit(TAKE.stop, "stop", { g: 1.1 });
hit(TAKE.entry, "entry", { g: 1.2 });
hit(S.tp, "tp", { g: 1.1 });
hit(S.tp, "stamp", { g: 1 });
// The wall lights up outward from the tile the camera left.
wall.forEach((w) => {
  const far = Math.hypot(w.col - hero.col, w.row - hero.row);
  hit(S.tp + 0.08 + far * 0.07, "flip", { i: (w.col + w.row) % 4, g: 0.24, pan: (w.col - 2.5) / 3.5 });
});
// From here the cuts ride the music, so an effect only colours one; a kick or a stamp of its own on
// every cut makes each one sound like an edit.
hit(S.rail - 0.18, "whoosh", { d: 0.36, g: 0.5 });
hit(S.rail, "ping", { g: 0.5 });
hit(S.replayBtn, "tick", { f: 1600, g: 0.8 }); // ▶ 覆盤這段
hit(S.replayBtn + 0.5, "ping", { g: 0.35 });
FEATURES.forEach((f, i) => {
  if (i < 3) {
    hit(f.at - 0.15, "whoosh", { d: 0.3, g: 0.35 });
    hit(f.at + f.on, "flip", { i, g: 0.35 });
  } else {
    hit(f.at, "flip", { i: i % 4, g: 0.4 });
  }
});
FLICKER.forEach((t, i) => hit(t, "thud", { g: 0.55 + i * 0.1 }));
hit(S.implode, "suck", { d: S.logo - S.implode });
mkdirSync("assets/audio", { recursive: true });
writeFileSync("assets/audio/cues.json", JSON.stringify({ end: S.end, S, take: TAKE, hits }));
console.log("index.html", Math.round(html.length / 1024), "KB;", hits.length, "hits");
