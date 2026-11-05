// Records the three takes of the 8/22 promo from the real lab, driven by its replay engine on a
// fake clock at a phone's width (1080 × 1920):
//   context.mp4  15 分 K at 18:22:30, K 線 alone, then CVD, 現貨 CVD, OI and 溢價 switch on one by one
//   sweep.mp4    1 分足跡 18:22 → 18:23:45: the sweep into the 13:11 low, the buys at 76,600, a freeze
//   trade.mjs    1 分 K 18:24:30 → 18:40: the long at 18:26's close, its stop, and the run to 2R
// node scripts/shots.mjs [context|sweep|trade ...] [--check]
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
const at = (hms) => `2026-08-22T${hms}+08:00`;
const ms = (hms) => Date.parse(at(hms));

const OFF = { profile: false, dprofile: false, heat: false, dom: false, prints: false, stack: false, vwap: false, levels: false, liqmark: false, events: false, lmap: false, stats: false, volume: false, delta: false, cvd: false, scvd: false, liq: false, oi: false, doi: false, funding: false, premium: false, ratio: false, top: false, imb: false };
const LOW = { id: "low", price: 76510, label: "13:11 低點 76,510" };
// The long: signal bar 18:26, entry at its close; stop 0.1 % under the 18:23 low; target 2R.
export const TRADE = { side: "long", entry: 76667.9, stop: 76436, target: 77131.8 };

const SHOTS = {
  context: {
    roll: "18:22:30",
    ms: 9000,
    steps: [
      { at: at("17:40:00"), speed: 400, tf: "15", mode: "candles", barW: 15, ind: OFF, caption: "", line: LOW },
      // Holds freeze the clock; at speed 1 the millisecond between them passes in a millisecond.
      { at: at("18:22:30"), speed: 1, hold: 1700 },
      { at: at("18:22:30.001"), ind: { ...OFF, cvd: true }, hold: 1800 },
      { at: at("18:22:30.002"), ind: { ...OFF, cvd: true, scvd: true }, hold: 1900 },
      { at: at("18:22:30.003"), ind: { ...OFF, cvd: true, scvd: true, oi: true }, hold: 1700 },
      { at: at("18:22:30.004"), ind: { ...OFF, cvd: true, scvd: true, oi: true, premium: true }, hold: 5000 },
    ],
  },
  sweep: {
    roll: "18:22:00",
    ms: 8600,
    steps: [
      { at: at("17:40:00"), speed: 400, tf: "1", mode: "footprint", barW: 96, printMin: 25, ind: { ...OFF, prints: true }, caption: "", line: LOW },
      { at: at("18:22:00"), speed: 20 },
      { at: at("18:22:34"), speed: 14 },
      { at: at("18:23:44"), speed: 0.001, hold: 5000 },
    ],
  },
  // The signal bar: 18:26 in footprint; at its close the two stacked buy imbalances are boxed
  // (76,630 buys 28.8 over 0.9 sold below, 76,640 buys 62.3 over 17.2).
  imbalance: {
    roll: "18:25:40",
    ms: 4000,
    steps: [
      { at: at("17:40:00"), speed: 400, tf: "1", mode: "footprint", barW: 150, printMin: 25, ind: { ...OFF }, caption: "", line: LOW },
      { at: at("18:25:40"), speed: 40 },
      { at: at("18:27:00"), speed: 0.001, hold: 5000, box: { id: "imb", from: "18:26:00", to: "18:26:59", low: 76630, high: 76650 } },
    ],
  },
  trade: {
    roll: "18:24:30",
    ms: 7400,
    steps: [
      { at: at("17:40:00"), speed: 400, tf: "1", mode: "candles", barW: 22, ind: { ...OFF, scvd: true, oi: true }, caption: "", line: LOW },
      { at: at("18:24:30"), speed: 60 },
      { at: at("18:27:00"), speed: 260, position: TRADE },
      { at: at("18:40:00"), speed: 0.001, hold: 5000 },
    ],
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
  const script = { title: "8/22", date: "2026-08-22", tz: "+08:00", data: "2026-08-22.data.json", steps: plan.steps };
  await page.route("**/cases/2026-08-22.json", (r) => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(script) }));
  await page.route("**/cases/2026-08-22.data.json", (r) => r.fulfill({ status: 200, contentType: "application/json", body: data }));
  await page.route("**/lab/orderflow/app.js", (r) => r.fulfill({ status: 200, contentType: "text/javascript", body: patchApp(readFileSync(join(REPO, "public/lab/orderflow/app.js"), "utf8")) }));
  await page.clock.install({ time: Date.parse("2026-10-20T00:00:00Z") });
  await page.goto(lab.url("?case=2026-08-22"), { waitUntil: "domcontentloaded" });
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
