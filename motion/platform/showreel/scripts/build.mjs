// Writes index.html from template.html and scene-timeline.js, and assets/audio/cues.json (the hits
// and sections score.py reads). Run from this folder: node scripts/build.mjs
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { FEATURES, RING, S } from "./cues.mjs";
import { REPO, TAPE } from "./lab-rig.mjs";
import { loadPlan } from "./take-plan.mjs";

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
const TAKE = {
  start: takeStart,
  full: filmAt(plan.t3.fill),
  fpCut: filmAt(taipei("2026-09-14T21:05:00")),
  stop: filmAt(plan.t3.touchAt),
  why: filmAt(taipei("2026-09-14T21:08:40")),
  entry: filmAt(plan.t4.fill),
  zoomOut: filmAt(taipei("2026-09-14T21:12:00")),
};
console.log("take", Object.fromEntries(Object.entries(TAKE).map(([k, v]) => [k, +v.toFixed(3)])));

// ---------- the wall ----------
const SEG = ["2026-09-14", "2026-09-24", "2026-08-21", "2026-08-27", "2026-08-31", "2026-08-24"];
const seg = (id) => JSON.parse(readFileSync(join(REPO, `motion/replays/segments/assets/data/${id}.json`), "utf8"));
const when = new Intl.DateTimeFormat("zh-TW", { timeZone: "Asia/Taipei", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
const wall = [];
for (const id of SEG) {
  const d = seg(id);
  for (const t of d.trades) {
    const a = Math.max(0, t.signal - 22);
    wall.push({ at: when.format(t.entryT).replace(/\s+/g, " "), entry: t.entry, stop: t.stop, tp: t.tp, r: t.r, result: t.result, i0: t.signal - a, i1: t.exit - a, bars: d.bars.slice(a, Math.min(d.bars.length, t.exit + 8)).map((x) => x.slice(1, 5)) });
  }
}
// The 9/14 21:09 trade (index 3) goes to the middle of the wall, where the camera can reach it.
const cellOf = (i) => (i === 3 ? 15 : i === 15 ? 3 : i);
wall.forEach((w, i) => {
  w.col = cellOf(i) % 6;
  w.row = Math.floor(cellOf(i) / 6);
});
const tiles = wall.map((w, i) => {
  const x = (w.col - 2.5) * 850 - 400, y = (w.row - 2) * 500 - 225;
  const inside = i === 3 ? `<div id="tv">${video("dive", "dive", +takeStart.toFixed(4), +(S.rail - takeStart).toFixed(4))}</div>` : "";
  return `            <div id="tile${i}" class="tile ${w.result}" style="left:${x}px;top:${y}px"><canvas id="tc${i}" width="800" height="450"></canvas><div class="t-at">${w.at}</div><div class="t-res ${w.result}">${w.result === "tp" ? `+${w.r}R` : "−1R"}</div>${inside}<div class="t-edge"></div></div>`;
});

// ---------- the screens ----------
const screens = [
  // The card opens at 1.1 s of the rail clip and ▶ 覆盤這段 is pressed at 3.2 s.
  screen("railA", "rail", S.rail, S.replayBtn - S.rail, 1.2),
  screen("railB", "rail", S.replayBtn, S.feat - S.replayBtn, 4.3, 3.3),
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
const FLICKER = [21.85, 22.2, 22.45, 22.6, 22.68];

const data = `      const S = ${JSON.stringify(S)};
      const TAKE = ${JSON.stringify(TAKE)};
      const WALL = ${JSON.stringify(wall)};
      const FEATURES = ${JSON.stringify(FEATURES.map(({ id, at, d, from, to, name }) => ({ id, at, d, from, to, name })))};
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
// The wall's tiles
wall.forEach((w, i) => hit(0.1 + (w.col + w.row) * 0.2 + (i % 3) * 0.03, "flip", { i: i % 4, g: 0.36, pan: (w.col - 2.5) / 3.5 }));
// In the silence, the real trades of that minute are the only rhythm: pitch by side, level by size.
let last = -1;
for (const s of plan.data.slices) {
  const t = plan.data.start + s[0] * 1000;
  if (t < plan.pins[0][1] || t > plan.t4.touchAt) continue;
  const c = clock.find((x) => x[1] >= t);
  if (!c) continue;
  const f = takeStart + c[0];
  if (f - last < 0.03 || f >= S.breath) continue;
  let buy = 0, sell = 0;
  for (const [, b, a] of s[5]) (buy += b), (sell += a);
  const size = Math.sqrt(buy + sell);
  if (size < 2.2) continue;
  last = f;
  hit(f, "tick", { f: buy >= sell ? 2300 : 1400, g: Math.min(0.7, 0.07 + size / 22), pan: buy >= sell ? 0.2 : -0.2 });
}
hit(TAKE.fpCut - 0.2, "whoosh", { d: 0.22, g: 0.8 });
hit(TAKE.fpCut, "thud", { g: 0.7 });
hit(TAKE.full, "entry", { g: 0.85 });
hit(TAKE.stop, "stop", { g: 1.15 });
hit(TAKE.entry, "entry", { g: 1.3 });
hit(TAKE.zoomOut - 0.2, "whoosh", { d: 0.22, g: 0.7 });
hit(S.tp, "tp", { g: 1.1 });
hit(S.tp, "stamp", { g: 1 });
hit(S.rail - 0.18, "whoosh", { d: 0.36, g: 1.1 });
hit(S.rail + 0.05, "ping");
hit(S.replayBtn - 0.02, "tick", { f: 1600, g: 1.5 }); // ▶ 覆盤這段
hit(S.replayBtn - 0.35, "whoosh", { d: 0.35, g: 0.5 });
hit(S.replayBtn + 0.45, "ping", { g: 0.7 });
FEATURES.forEach((f, i) => {
  hit(f.at, "stamp", { g: 0.75 });
  if (i < 3) {
    hit(f.at - 0.04, "whoosh", { d: 0.3, g: 0.95 });
    hit(f.at + 0.5, "thud", { g: 0.85 });
    hit(f.at + 0.5, "flip", { i, g: 0.7 });
  } else {
    hit(f.at, "flip", { i: i % 4, g: 1 });
  }
});
FLICKER.forEach((t, i) => hit(t, "thud", { g: 0.55 + i * 0.1 }));
hit(S.implode, "suck", { d: S.logo - S.implode });
mkdirSync("assets/audio", { recursive: true });
writeFileSync("assets/audio/cues.json", JSON.stringify({ end: S.end, S, take: TAKE, hits }));
console.log("index.html", Math.round(html.length / 1024), "KB;", hits.length, "hits");
