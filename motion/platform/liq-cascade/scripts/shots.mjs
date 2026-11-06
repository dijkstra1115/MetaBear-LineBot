// Records the five takes of the 10/30 盤面解剖 from the real lab, driven by its replay engine on a
// fake clock at a phone's width (1080 × 1920). Times are Taipei.
//   hook.mp4   1 分 K 04:38 → 04:48:30 with liquidation marks and pane: the whole cascade, fast
//   build.mp4  1 分 K 04:22 → 04:40:30 with OI and CVD: OI climbing before the drop
//   fp.mp4     1 分足跡 04:41:40 → 04:43:50: the first wave, the 252 BTC buy run over
//   panes.mp4  1 分 K at 04:44: CVD, 現貨 CVD, then 溢價 switch on
//   after.mp4  1 分 K 04:43 → 04:51 with OI and liquidations: the second wave, then the bounce
// node scripts/shots.mjs [hook|build|fp|panes|after ...] [--check]
//
// Capture-only changes, served to this browser and nowhere else: the replay controls, badge and
// caption and the chart's replay footnote are hidden (the film carries the disclosure), and the
// price scale glides instead of jumping. Prices, trades and the stop/target hits are the page's own.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { newLab, PROJECT, REPO, shot, startServer, TAPE } from "./rig.mjs";

const CHECK = process.argv.includes("--check");
const ONLY = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const FPS = 30;
const OUT = join(PROJECT, CHECK ? ".tape/check" : "assets/video");
mkdirSync(OUT, { recursive: true });
const data = readFileSync(join(TAPE, "case.data.json"));
const at = (hms) => `2026-10-30T${hms}+08:00`;
const ms = (hms) => Date.parse(at(hms));

const OFF = { profile: false, dprofile: false, heat: false, dom: false, prints: false, stack: false, vwap: false, levels: false, liqmark: false, events: false, lmap: false, stats: false, volume: false, delta: false, cvd: false, scvd: false, liq: false, oi: false, doi: false, funding: false, premium: false, ratio: false, top: false, imb: false };
const FIRST = (view) => ({ at: at("04:20:00"), speed: 400, caption: "", ...view });

const SHOTS = {
  hook: {
    roll: "04:38:00",
    ms: 3600,
    steps: [FIRST({ tf: "1", mode: "candles", barW: 18, ind: { ...OFF, liqmark: true, liq: true } }), { at: at("04:38:00"), speed: 230 }, { at: at("04:48:30"), speed: 0.001, hold: 5000 }],
  },
  build: {
    roll: "04:22:00",
    ms: 4500,
    steps: [FIRST({ tf: "1", mode: "candles", barW: 14, ind: { ...OFF, oi: true, cvd: true } }), { at: at("04:22:00"), speed: 340 }, { at: at("04:40:30"), speed: 0.001, hold: 5000 }],
  },
  fp: {
    roll: "04:41:40",
    ms: 5600,
    steps: [FIRST({ tf: "1", mode: "footprint", barW: 96, printMin: 50, ind: { ...OFF, prints: true, liqmark: true } }), { at: at("04:41:40"), speed: 30 }, { at: at("04:43:50"), speed: 0.001, hold: 5000 }],
  },
  panes: {
    roll: "04:44:00",
    ms: 6600,
    steps: [
      FIRST({ tf: "1", mode: "candles", barW: 18, ind: { ...OFF } }),
      // Holds freeze the clock; at speed 1 the millisecond between them passes in a millisecond.
      { at: at("04:44:00"), speed: 1, hold: 1200 },
      { at: at("04:44:00.001"), ind: { ...OFF, cvd: true }, hold: 1800 },
      { at: at("04:44:00.002"), ind: { ...OFF, cvd: true, scvd: true }, hold: 1800 },
      { at: at("04:44:00.003"), ind: { ...OFF, cvd: true, scvd: true, premium: true }, hold: 5000 },
    ],
  },
  after: {
    roll: "04:43:00",
    ms: 5400,
    steps: [FIRST({ tf: "1", mode: "candles", barW: 18, ind: { ...OFF, oi: true, liq: true, liqmark: true } }), { at: at("04:43:00"), speed: 120 }, { at: at("04:51:00"), speed: 0.001, hold: 5000 }],
  },
};

const patchApp = (text) => {
  const src = text.split("\r\n").join("\n");
  const foot = /\n[^\n]*ctx\.fillText\(`歷史資料回放[^\n]*\n/;
  const range = "  lo -= pad;\n  hi += pad;\n  lastAuto = { lo, hi };\n";
  // The replay steps by animation-frame time, and every screenshot adds frames of its own; here it
  // steps exactly what the recorder hands it (window.__step), once, so a take is the same every run.
  const loop = "  const dt = Math.min(250, now - replay.last);\n";
  if (!foot.test(src) || !src.includes(range) || !src.includes(loop)) throw new Error("app.js changed; update patchApp");
  return src
    .replace(loop, "  const dt = window.__step ?? 0;\n  window.__step = 0;\n")
    .replace(foot, "\n")
    .replace(range, "  lo -= pad;\n  hi += pad;\n  if (window.__range) {\n    lo = window.__range.lo + (lo - window.__range.lo) * 0.14;\n    hi = window.__range.hi + (hi - window.__range.hi) * 0.14;\n  }\n  window.__range = { lo, hi };\n  lastAuto = { lo, hi };\n");
};

const clockOf = async (page) => {
  const m = (await page.textContent("#rp-clock")).match(/(\d\d):(\d\d):(\d\d)/);
  return m ? ms(`${m[1]}:${m[2]}:${m[3]}`) : 0;
};

const srv = startServer();
await srv.ready;
const logs = {};
for (const [name, plan] of Object.entries(SHOTS)) {
  if (ONLY.length && !ONLY.includes(name)) continue;
  const lab = await newLab({ scale: CHECK ? 1 : 2 });
  const { page } = lab;
  const script = { title: "10/30", date: "2026-10-30", tz: "+08:00", data: "2026-10-30.data.json", steps: plan.steps };
  await page.route("**/cases/2026-10-30.json", (r) => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(script) }));
  await page.route("**/cases/2026-10-30.data.json", (r) => r.fulfill({ status: 200, contentType: "application/json", body: data }));
  await page.route("**/lab/orderflow/app.js", (r) => r.fulfill({ status: 200, contentType: "text/javascript", body: patchApp(readFileSync(join(REPO, "public/lab/orderflow/app.js"), "utf8")) }));
  await page.clock.install({ time: Date.parse("2026-10-20T00:00:00Z") });
  await page.goto(lab.url("?case=2026-10-30"), { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => document.getElementById("status")?.hidden === true, null, { timeout: 60_000 });
  await page.evaluate(() => document.fonts.ready);
  await page.addStyleTag({ content: "#caption,#replay,#live,#zoom-out,#zoom-in,#latest{display:none!important}" });
  await page.evaluate(() => document.getElementById("rp-play").click());
  // Pre-roll at the first step's speed until the take's first moment, then the camera rolls.
  const roll = ms(plan.roll);
  let n = 0;
  const step = () => page.evaluate((d) => (window.__step = d), 1000 / FPS);
  while ((await clockOf(page)) < roll) {
    await step();
    await page.clock.runFor(1000 / FPS);
    if (++n > 5000) throw new Error(`${name}: pre-roll did not reach ${plan.roll}`);
  }
  const log = [];
  await shot({ page, file: join(OUT, `${name}.mp4`), fps: FPS, ms: plan.ms, check: CHECK, checkEvery: FPS, beforeFrame: step, onFrame: async (f) => log.push([f, (await page.textContent("#rp-clock")).slice(-8)]) });
  logs[name] = log;
  await lab.browser.close();
}
srv.stop();
writeFileSync(join(TAPE, `shots-log${CHECK ? "-check" : ""}.json`), JSON.stringify(logs));
for (const [name, log] of Object.entries(logs)) console.log(name, log.filter((_, i) => i % FPS === 0).map((x) => `${(x[0] / FPS).toFixed(0)}s ${x[1]}`).join(" | "));
