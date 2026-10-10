// Builds the live-footage cut: an edit decision list over the three recordings (assets/video/*.mp4
// from scripts/capture.mjs), placed on the song's bar grid, with a virtual camera per shot; writes
// index.html, injects the shared kit and each overlay's numbers into compositions/*.html, and writes
// assets/audio/cues.json for scripts/music.mjs.
// Shot sources are found from the per-frame recording logs (game second, settled, …), so a re-capture
// keeps every cut on its event.
// Usage: node scripts/build.mjs
import fs from "node:fs";

const BAR = 240 / 116.55; // "Raya (Sped Up)", first downbeat 0.50 s
const bar = (n, beat = 0) => +(n * BAR + (beat * BAR) / 4).toFixed(4);
const DURATION = 47.9;
const W = 1920, H = 1080;

const rec = Object.fromEntries(["deyo", "easy", "liu"].map((k) => [k, JSON.parse(fs.readFileSync(`assets/video/${k}.json`, "utf8"))]));
const replay = Object.fromEntries(JSON.parse(fs.readFileSync("assets/data/replay.json", "utf8")).map((g) => [g.name, g]));
const games = { deyo: replay["deyo"], easy: replay["easy_yu"], liu: replay["劉孟孟"] };
const sec = (k, f) => +(f / rec[k].fps).toFixed(4);
// recording second of the first frame where test(frame) holds
const when = (k, test) => {
  const f = rec[k].frames.find(test);
  if (!f) throw Error(`${k}: no frame matches ${test}`);
  return sec(k, f.f);
};
const atGame = (k, g) => when(k, (f) => f.g >= g);
const settled = (k) => when(k, (f) => f.done);
const recEnd = (k) => sec(k, rec[k].frames.length - 1);

// camera framings in 1920×1080 page space: centre and scale
const FRAME = {
  wide: { cx: 960, cy: 540, s: 1 },
  chart: { cx: 930, cy: 600, s: 1.22 },
  chartHi: { cx: 930, cy: 470, s: 1.3 },
  storm: { cx: 930, cy: 430, s: 1.45 },
  hud: { cx: 470, cy: 410, s: 1.9 },
  header: { cx: 760, cy: 250, s: 2.1 },
  panel: { cx: 928, cy: 600, s: 1.6 },
  panelIn: { cx: 928, cy: 600, s: 1.85 },
};
const camOf = (c) => (typeof c === "string" ? FRAME[c] : c);
const pose = ({ cx, cy, s }) => ({
  x: +Math.min(0, Math.max(W - W * s, W / 2 - cx * s)).toFixed(1),
  y: +Math.min(0, Math.max(H - H * s, H / 2 - cy * s)).toFixed(1),
  scale: s,
});

// ---------- the edit ----------
// shot: film [start, end), source k from `from` at `rate`, camera from → to, grade
const shots = [];
const shot = (k, start, end, from, rate, cam, o = {}) => shots.push({ k, start, end, from: Math.max(0, from), rate, cam, ...o });
const fitRate = (from, to, start, end) => +((to - from) / (end - start)).toFixed(4);
const mixCam = (a, b, x) => ({ cx: a.cx + (b.cx - a.cx) * x, cy: a.cy + (b.cy - a.cy) * x, s: a.s + (b.s - a.s) * x });
// A time-warped stretch of one recording: keys are [film second, recording second]; each span between
// keys is its own clip at its own rate, so the events at the keys land exactly on the film's beats.
// The camera moves across the whole stretch; the seams are invisible (same source, continuous).
const run = (k, keys, camA, camB, o = {}) => {
  const t0 = keys[0][0], t1 = keys.at(-1)[0];
  const A = typeof camA === "string" ? FRAME[camA] : camA, Bc = typeof camB === "string" ? FRAME[camB] : camB;
  const ease = (x) => (x < 0.5 ? 2 * x * x : 1 - (-2 * x + 2) ** 2 / 2);
  for (let i = 0; i + 1 < keys.length; i++) {
    const [fa, ra] = keys[i], [fb, rb] = keys[i + 1];
    const ca = mixCam(A, Bc, ease((fa - t0) / (t1 - t0))), cb = mixCam(A, Bc, ease((fb - t0) / (t1 - t0)));
    shots.push({ k, start: fa, end: fb, from: Math.max(0, ra), rate: fitRate(ra, rb, fa, fb), cam: [ca, cb], seam: i > 0, ...o });
  }
};

// intro (bars 0–2): one beat each from the three games, then the title over the wide board
const dSpike = atGame("deyo", 7161);
const eTop = atGame("easy", 6726);
const lMega = atGame("liu", 4188);
const lPanel = settled("liu");
shot("deyo", bar(0, 0), bar(0, 1), dSpike + 0.05, 1, ["storm", "chartHi"], { grade: "hot" });
shot("easy", bar(0, 1), bar(0, 2), eTop - 0.1, 1, ["chartHi", "chart"], { grade: "hot" });
shot("liu", bar(0, 2), bar(0, 3), lMega - 0.05, 1, ["chartHi", "chart"], { grade: "hot" });
shot("liu", bar(0, 3), bar(1, 0), lPanel + 0.6, 1, ["panelIn", "panel"], { grade: "hot" });
shot("liu", bar(1, 0), bar(2, 0), atGame("liu", 2600), 0.6, ["wide", "chart"], { grade: "dim" });
shot("deyo", bar(2, 0), bar(2, 1), dSpike + 0.9, 1, ["chart", "wide"], { grade: "hot" });
shot("easy", bar(2, 1), bar(2, 2), eTop + 0.4, 1, ["hud", "chartHi"], { grade: "hot" });
shot("liu", bar(2, 2), bar(2, 3), lMega + 0.3, 1, ["storm", "chart"], { grade: "hot" });
shot("deyo", bar(2, 3), bar(3, 0), settled("deyo") + 0.8, 1, ["panelIn", "panel"], { grade: "hot" });

// No.3 deyo — the breath (bar 3) runs the countdown in grey; the spike lands on the drop (bar 4)
const dFirst = atGame("deyo", 7158);
shot("deyo", bar(3), bar(4), dSpike - BAR, 1, ["chart", "chartHi"], { grade: "dim" });
shot("deyo", bar(4), bar(5), dSpike, 1, ["chartHi", "storm"]);
shot("deyo", bar(5), bar(6), dSpike + BAR, 2.6, ["hud", "hud"]);
const dSettle = settled("deyo");
shot("deyo", bar(6), bar(7), dSettle - BAR, 1, ["chart", "wide"]);
shot("deyo", bar(7), bar(8), dSettle, 1, ["panel", "panelIn"]);

// No.2 easy_yu — the ladder in one bar, the climb over two, the bell and the panel
const eClimb = atGame("easy", 5790);
const eSettle = settled("easy");
const STEP_BEATS = [bar(9, 0), bar(9, 2), bar(9, 3), bar(10, 0), bar(10, 2)];
const steps = [5845, 6236, 6417, 6525, 6725].map((g) => atGame("easy", g + 1));
run("easy", [[bar(8), 0], [STEP_BEATS[0], steps[0]]], "wide", "chart");
run("easy", [...STEP_BEATS.map((t, i) => [t, steps[i]]), [bar(11), atGame("easy", 6760)]], "chart", "chartHi");
shot("easy", bar(11), bar(11, 2), eSettle - BEATS(2), 1, ["wide", "wide"]);
shot("easy", bar(11, 2), bar(12), eSettle, 1, ["panel", "panelIn"]);

// No.1 劉孟孟 — the breath shows the wall going in; the first push lands on the second drop
const lPush = atGame("liu", 2227);
const lSelf = atGame("liu", 4256);
const lLast = atGame("liu", 4603);
shot("liu", bar(12), bar(13), 0, fitRate(0, lPush - 0.1, bar(12), bar(13)), ["wide", "chart"], { grade: "dim" });
// push/close events: half bars first, then every beat, then the last pushes on downbeats
const LOOP = [
  [bar(13, 0), 2227], [bar(13, 2), 2765], [bar(14, 0), 2878], [bar(14, 1), 3239], [bar(14, 2), 3277], [bar(14, 3), 3535],
  [bar(15, 0), 3579], [bar(15, 1), 3688], [bar(15, 2), 3739], [bar(15, 3), 3951], [bar(16, 0), 4005], [bar(17, 0), 4188],
];
run("liu", LOOP.map(([t, g]) => [t, atGame("liu", g + 1) - 0.02]), "chart", "chartHi");
// the last push in slow motion, then the self-close on the next downbeat
shot("liu", bar(17), bar(18), atGame("liu", 4189) - 0.02, fitRate(atGame("liu", 4189) - 0.02, lSelf - 0.02, bar(17), bar(18)), ["chartHi", "storm"], { grade: "hot" });
shot("liu", bar(18), bar(19), lSelf - 0.02, fitRate(lSelf - 0.02, lLast + 0.3, bar(18), bar(19)), ["hud", "chart"]);
shot("liu", bar(19), bar(20), lLast + 0.3, fitRate(lLast + 0.3, lPanel, bar(19), bar(20)), ["wide", "wide"]);
shot("liu", bar(20), bar(21), lPanel, 1, ["panel", "panelIn"]);

function BEATS(n) {
  return (n * BAR) / 4;
}

// keep every shot inside its recording
for (const s of shots) {
  const need = s.from + (s.end - s.start) * s.rate;
  if (need > recEnd(s.k) + 1e-3) throw Error(`${s.k} shot at ${s.start}s needs ${need.toFixed(2)}s of a ${recEnd(s.k)}s recording`);
}

// film second at which game second g of recording k is on screen, within film range [lo, hi)
const filmOf = (k, g, lo = 0, hi = DURATION) => {
  const r = atGame(k, g);
  const s = shots.find((x) => x.k === k && x.start >= lo && x.start < hi && r >= x.from && r <= x.from + (x.end - x.start) * x.rate + 1e-6);
  if (!s) throw Error(`${k} game ${g}s is not on screen between ${lo} and ${hi}`);
  return +(s.start + (r - s.from) / s.rate).toFixed(4);
};

// ---------- overlays ----------
const COL = Object.fromEntries(replay["deyo"].columns.map((c, i) => [c, i]));
const card = (g) => ({ name: g.name, seed: g.seed, pnl: g.pnl, peak: g.peak, leverage: g.leverage, actions: g.orders.length, bell: g.ticks.find((r) => r[COL.t] === g.end)[COL.equity] });
// the recording's own numbers per film frame, so on-screen counters follow the footage
const follow = (k, list) =>
  list.map((s) => ({ start: s.start, end: s.end, from: s.from, rate: s.rate, fps: rec[k].fps })).map((s) => s);
const liuFrames = rec.liu.frames.map((f) => [f.g, Math.round(f.rz / 1e6), Math.round(f.eq / 1e6), f.price]);
const DATA = {
  "ov-open": { deyo: card(games.deyo) },
  "ov-deyo": {
    ...card(games.deyo),
    spike: { from: Math.round(games.deyo.ticks[7160][COL.last] / 100), to: Math.round(games.deyo.ticks[7161][COL.last] / 100) },
    left: 7200 - games.deyo.orders.find((o) => o.op !== "leverage").t,
    orders: games.deyo.orders.length - 1,
  },
  "ov-easy": {
    ...card(games.easy),
    climb: [5845, 6236, 6417, 6525, 6725].map((g, i) => ({ g, film: STEP_BEATS[i], price: Math.round(games.easy.ticks[g + 2][COL.last] / 100) })),
    rungs: games.easy.orders.filter((o) => o.op === "enqueue" && o.args.type === "limit" && o.args.side === "buy" && !o.args.reduceOnly).map((o) => Math.round(o.args.price / 100)),
  },
  "ov-liu": {
    ...card(games.liu),
    wall: 92731,
    shots: follow("liu", shots.filter((s) => s.k === "liu" && s.start >= bar(12))),
    pushFilm: LOOP.filter((_, i) => i % 2 === 0).map(([t]) => t),
    closeFilm: LOOP.filter((_, i) => i % 2 === 1 && i < 10).map(([t]) => t),
    megaFilm: bar(17),
    selfFilm: bar(18),
    lastFilm: filmOf("liu", 4604, bar(18), bar(20)),
    frames: liuFrames,
    lastClose: Math.max(...games.liu.orders.filter((o) => o.args?.type === "close").map((o) => o.t)),
    peakPrice: Math.round(Math.max(...games.liu.ticks.map((r) => r[COL.last])) / 100),
  },
  "ov-end": { rows: [games.deyo, games.easy, games.liu].map(card) },
  "fx-overlay": { cuts: shots.filter((s) => !s.seam).map((s) => s.start).filter((t) => t > 0) },
};
const SCENES = [
  { id: "ov-open", start: 0, end: bar(4) },
  { id: "ov-deyo", start: bar(4), end: bar(8) },
  { id: "ov-easy", start: bar(8), end: bar(12) },
  { id: "ov-liu", start: bar(12), end: bar(21) },
  { id: "ov-end", start: bar(21), end: DURATION },
];
const OVERLAY = { id: "fx-overlay", start: 0, end: DURATION };

const kitCss = fs.readFileSync("scripts/kit.css", "utf8").trim();
const kitJs = fs.readFileSync("scripts/kit.js", "utf8").trim();
const indent = (s, n) => s.split("\n").map((l) => (l ? " ".repeat(n) + l : l)).join("\n");
const replace = (src, a, b, body, file) => {
  const i = src.indexOf(a), j = src.indexOf(b);
  if (i < 0 || j < i) throw new Error(`${file}: markers ${a} … ${b} missing`);
  return src.slice(0, i + a.length) + "\n" + body + "\n" + src.slice(j);
};
const written = (s) => fs.existsSync(`compositions/${s.id}.html`);
for (const s of [...SCENES, OVERLAY].filter(written)) {
  const file = `compositions/${s.id}.html`;
  let src = fs.readFileSync(file, "utf8");
  src = replace(src, "/* @kit-css:start */", "/* @kit-css:end */", indent(kitCss, 8), file);
  src = replace(src, "// @scene:start", "// @scene:end", indent(`const SCENE = ${JSON.stringify({ id: s.id, T0: s.start, DUR: +(s.end - s.start).toFixed(4) })};`, 10), file);
  src = replace(src, "// @kit-js:start", "// @kit-js:end", indent(kitJs, 10), file);
  src = replace(src, "// @data:start", "// @data:end", indent(`const DATA = ${JSON.stringify(DATA[s.id])};`, 10), file);
  fs.writeFileSync(file, src);
}

// ---------- index.html ----------
const cams = shots.map((s, i) => {
  const id = `s${String(i).padStart(2, "0")}`;
  const dur = +(s.end - s.start).toFixed(4);
  return {
    id,
    html: `        <div class="cam" id="cam-${id}">
          <div class="cam-in" id="camin-${id}" data-layout-allow-overflow>
            <video id="v-${id}" class="clip shot${s.grade ? " " + s.grade : ""}" src="assets/video/${s.k}.mp4" muted playsinline data-start="${s.start}" data-duration="${dur}" data-media-start="${s.from.toFixed(4)}" data-playback-rate="${s.rate}" data-track-index="1"></video>
          </div>
        </div>`,
    js: `      tl.fromTo("#camin-${id}", ${JSON.stringify(pose(camOf(s.cam[0])))}, { ...${JSON.stringify(pose(camOf(s.cam[1])))}, duration: ${dur}, ease: "${s.seam || s.cam[0] === s.cam[1] ? "none" : "power2.inOut"}" }, ${s.start});`,
  };
});
const slot = (s, track) =>
  `      <div id="${s.id}" class="layer" data-composition-id="${s.id}" data-composition-src="compositions/${s.id}.html" data-start="${s.start}" data-duration="${+(s.end - s.start).toFixed(4)}" data-track-index="${track}" data-width="1920" data-height="1080"></div>`;
const index = `<!doctype html>
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
        background: #05070b;
      }
      #root {
        position: relative;
        width: 100%;
        height: 100%;
        overflow: hidden;
        background: #05070b;
      }
      #root > .layer {
        position: absolute;
        inset: 0;
      }
      #reel {
        position: absolute;
        inset: 0;
        overflow: hidden;
      }
      .cam {
        position: absolute;
        left: 0;
        top: 0;
        width: 1920px;
        height: 1080px;
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
        filter: contrast(1.06) saturate(1.12);
      }
      video.shot.dim {
        filter: grayscale(0.85) brightness(0.5) contrast(1.15);
      }
      video.shot.hot {
        filter: contrast(1.18) saturate(1.35) brightness(1.05);
      }
    </style>
  </head>
  <body>
    <!-- Generated by scripts/build.mjs from the edit list there; real gameplay recorded by scripts/capture.mjs. -->
    <div id="root" data-composition-id="main" data-start="0" data-duration="${DURATION}" data-width="1920" data-height="1080">
      <div id="reel">
${cams.map((c) => c.html).join("\n")}
      </div>
${SCENES.filter(written).map((s, i) => slot(s, 2 + (i % 2))).join("\n")}
${written(OVERLAY) ? slot(OVERLAY, 10) : ""}
      <audio id="soundtrack" src="assets/audio/soundtrack.wav" data-start="0" data-duration="${DURATION}" data-track-index="20" data-volume="1"></audio>
    </div>
    <script>
      const tl = gsap.timeline({ paused: true });
      // virtual camera per shot: push-ins and reframes on the recorded page
${cams.map((c) => c.js).join("\n")}
      window.__timelines["main"] = tl;
    </script>
  </body>
</html>
`;
fs.writeFileSync("index.html", index);

fs.mkdirSync("assets/audio", { recursive: true });
fs.writeFileSync(
  "assets/audio/cues.json",
  // song bars 0–11, song bar 15 (the breath before the build), then song bar 20 (the heaviest drop)
  JSON.stringify({ duration: DURATION, segments: [[0, 0.5], [bar(12), +(0.5 + 15 * BAR).toFixed(4)], [bar(13), +(0.5 + 20 * BAR).toFixed(4)]], fadeOut: [46.0, DURATION] }, null, 2),
);
console.log(`index.html: ${shots.length} shots, ${DURATION}s`);
for (const s of shots) console.log(`  ${s.start.toFixed(2)}–${s.end.toFixed(2)}  ${s.k.padEnd(5)} from ${s.from.toFixed(2)}s ×${s.rate}${s.seam ? " (seam)" : ""}${s.grade ? " " + s.grade : ""}`);
