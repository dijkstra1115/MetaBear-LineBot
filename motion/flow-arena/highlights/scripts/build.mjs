// Builds the film from the replay data: injects the shared kit (scripts/kit.css, scripts/kit.js) and
// each scene's numbers into compositions/*.html, and writes index.html (scene slots on the bar grid,
// overlay, soundtrack) plus assets/audio/cues.json for scripts/music.mjs.
// Usage: node scripts/build.mjs   (after scripts/export.mjs)
import fs from "node:fs";

const BAR = 2.0689655;
const D0 = 0.8512931;
const bar = (n, beat = 0) => +(D0 + n * BAR + (beat * BAR) / 4).toFixed(4);
const DURATION = 78;

const games = JSON.parse(fs.readFileSync("assets/data/replay.json", "utf8"));
const byName = Object.fromEntries(games.map((g) => [g.name, g]));
const liu = byName["劉孟孟"], easy = byName["easy_yu"], deyo = byName["deyo"];
const COL = Object.fromEntries(games[0].columns.map((c, i) => [c, i]));

const price = (g) => g.ticks.map((r) => Math.round(r[COL.last] / 100));
const money = (g, key, from = 0) => g.ticks.slice(from).map((r) => Math.round(r[COL[key]] / 1e5) / 10); // millions USDT
const btc = (g, from = 0) => g.ticks.slice(from).map((r) => Math.round(r[COL.position] / 100));
const first = (g, kind) => g.events.find((e) => e.kind === kind);
const peakAt = (g) => g.ticks.reduce((best, r) => (r[COL.equity] > best[1] ? [r[COL.t], r[COL.equity]] : best), [0, -Infinity]);
const card = (g) => ({
  name: g.name,
  seed: g.seed,
  pnl: g.pnl,
  leverage: g.leverage,
  actions: g.orders.length,
  ticks: g.ticks.length,
  peak: g.peak,
  peakT: peakAt(g)[0],
  bell: g.ticks.find((r) => r[COL.t] === g.end)[COL.equity],
  liqT: first(g, "liquidation")?.t ?? null,
  end: g.ticks.at(-1)[COL.t],
});

// action-log lines for the opening rain, verbatim from the stored logs
const logLines = [];
for (const g of games) for (const o of g.orders) logLines.push(JSON.stringify({ t: o.t, op: o.op, args: o.args }));

const settle = (g, from) => ({
  ...card(g),
  from,
  p: price(g).slice(from),
  eq: money(g, "equity", from),
  rz: money(g, "realized", from),
  pos: btc(g, from),
});

const opensBuy = (g) => g.orders.filter((o) => o.op === "enqueue" && o.args.type === "limit" && o.args.side === "buy" && !o.args.reduceOnly);
const sumWaves = (g, t0, t1) => g.waves.filter((w) => w.t >= t0 && w.t <= t1).reduce((s, w) => s + w.lots, 0);
const maxChain = (g, t0, t1) => Math.max(...g.waves.filter((w) => w.t >= t0 && w.t <= t1).map((w) => w.chain));
const realizedBefore = (g, t) => g.ticks[t][COL.realized];

const DATA = {
  "s1-open": {
    rows: [liu, easy, deyo].map(card),
    totals: { seeds: games.length, actions: games.reduce((s, g) => s + g.orders.length, 0), ticks: games.reduce((s, g) => s + g.ticks.length, 0) },
    log: logLines,
  },
  "s2-deyo": {
    ...card(deyo),
    p: price(deyo),
    eq: money(deyo, "equity", 7100),
    pos: btc(deyo, 7100),
    from: 7100,
    firstOrder: deyo.orders.find((o) => o.op !== "leverage").t,
    orders: deyo.orders.filter((o) => o.op !== "leverage").length,
    spike: { t: 7160, from: Math.round(deyo.ticks[7160][COL.last] / 100), to: Math.round(deyo.ticks[7161][COL.last] / 100) },
    liqBtc: Math.round(sumWaves(deyo, 7159, 7162) / 100),
    chain: maxChain(deyo, 7159, 7162),
  },
  "s3-easy": {
    ...card(easy),
    p: price(easy),
    eq: money(easy, "equity"),
    pos: btc(easy),
    rungs: opensBuy(easy).map((o) => ({ t: o.t, price: Math.round(o.args.price / 100), btc: o.args.lots / 100 })),
  },
  "s4-bell": { deyo: settle(deyo, 7190), easy: settle(easy, 7190) },
  "s5-liu": {
    ...card(liu),
    p: price(liu),
    rz: money(liu, "realized"),
    eq: money(liu, "equity"),
    pos: btc(liu),
    pushes: liu.orders.filter((o) => o.args?.type === "limit").map((o) => ({ t: o.t, price: Math.round(o.args.price / 100), btc: o.args.lots / 100 })),
    closes: liu.orders.filter((o) => o.args?.type === "close").map((o) => o.t),
    lastClose: Math.max(...liu.orders.filter((o) => o.args?.type === "close").map((o) => o.t)),
    wall: (() => {
      const b = liu.books.find((x) => x.label === "after" && x.t <= 2);
      return { last: Math.round(b.last / 100), bids: b.bids.map(([p, l]) => [Math.round(p / 100), l / 100]), asks: b.asks.map(([p, l]) => [Math.round(p / 100), l / 100]) };
    })(),
    pinMax: Math.max(...liu.ticks.slice(60, 2228).map((r) => r[COL.last])) / 100,
    banked: liu.orders.filter((o) => o.args?.type === "close").map((o, i, all) => {
      const next = liu.orders.find((x) => x.t > o.t && x.args?.type === "limit");
      const t = Math.min(next ? next.t : o.t + 300, liu.ticks.length - 1);
      return { t: o.t, settledT: t, rz: Math.round(realizedBefore(liu, t) / 1e5) / 10 };
    }),
  },
  "s6-thesis": { rows: [deyo, easy, liu].map(card) },
  "s7-end": {},
  "fx-overlay": {},
};

// scene slots on the film grid
const SCENES = [
  { id: "s1-open", start: 0, end: bar(7) },
  { id: "s2-deyo", start: bar(7), end: bar(13) },
  { id: "s3-easy", start: bar(13), end: bar(19) },
  { id: "s4-bell", start: bar(19), end: bar(24) },
  { id: "s5-liu", start: bar(24), end: bar(32) },
  { id: "s6-thesis", start: bar(32), end: bar(35) },
  { id: "s7-end", start: bar(35), end: DURATION },
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
for (const s of [...SCENES, OVERLAY]) {
  const file = `compositions/${s.id}.html`;
  if (!fs.existsSync(file)) {
    console.warn(`skip ${file} (not written yet)`);
    continue;
  }
  let src = fs.readFileSync(file, "utf8");
  src = replace(src, "/* @kit-css:start */", "/* @kit-css:end */", indent(kitCss, 8), file);
  src = replace(src, "// @scene:start", "// @scene:end", indent(`const SCENE = ${JSON.stringify({ id: s.id, T0: s.start, DUR: +(s.end - s.start).toFixed(4) })};`, 8), file);
  src = replace(src, "// @kit-js:start", "// @kit-js:end", indent(kitJs, 8), file);
  src = replace(src, "// @data:start", "// @data:end", indent(`const DATA = ${JSON.stringify(DATA[s.id])};`, 8), file);
  fs.writeFileSync(file, src);
  console.log(`${file}  ${s.start.toFixed(3)} → ${s.end.toFixed(3)}  (${(fs.statSync(file).size / 1024).toFixed(0)} KB)`);
}

const written = (s) => fs.existsSync(`compositions/${s.id}.html`);
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
    </style>
  </head>
  <body>
    <!-- Generated by scripts/build.mjs: scene slots on the 116 BPM bar grid. Edit the scene list there. -->
    <div id="root" data-composition-id="main" data-start="0" data-duration="${DURATION}" data-width="1920" data-height="1080">
${SCENES.filter(written).map((s, i) => slot(s, 1 + (i % 2))).join("\n")}
${written(OVERLAY) ? slot(OVERLAY, 10) : ""}
      <audio id="soundtrack" src="assets/audio/soundtrack.wav" data-start="0" data-duration="${DURATION}" data-track-index="20" data-volume="1"></audio>
    </div>
    <script>
      window.__timelines["main"] = gsap.timeline({ paused: true });
    </script>
  </body>
</html>
`;
fs.writeFileSync("index.html", index);

// cues for the soundtrack: song splice and a few hits
const cues = {
  duration: DURATION,
  bpm: 116,
  splice: [50.5063, 81.5408],
  fadeOut: [75.4, DURATION],
  hits: {
    drop1: bar(8),
    spike: bar(11),
    bell: bar(19),
    drop2: bar(25),
    thesis: bar(33),
  },
  orders: { start: bar(10, 1), count: deyo.orders.length - 1, span: BAR * 0.62 },
};
fs.mkdirSync("assets/audio", { recursive: true });
fs.writeFileSync("assets/audio/cues.json", JSON.stringify(cues, null, 2));
console.log("index.html, assets/audio/cues.json written");
