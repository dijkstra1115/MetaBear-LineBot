// Records the film's takes from the real lab, driven by its replay engine on a fake clock at
// 1920 × 930, each timed to the narration (assets/audio/vo/timeline.json):
//   context  15m at 20:00 with the POC; the four lower highs, then CVD and spot CVD switch on
//   break    20:15 → 20:45: the 188 BTC sell at 20:31 lands on "hits", CVD dives
//   plan     frozen at 20:45, zoomed out to the day: VAL 79,855, stop at the POC, target 77,800
//   wait     20:45 → 21:45, each bar closing on "One. Two. Three. Four." with its high marked
//   entry    21:45 → 21:50: the touch of 79,850 at 21:47 and the short opening on "Short."
//   result   21:48 → 23:02: the run to the target, held for the closing lines
// node scripts/shots.mjs [names ...] [--check]   (--check saves a still every second instead)
//
// Capture-only changes, served to this browser and nowhere else: the replay controls, caption,
// narration rail and drawing tools are hidden and the chart's replay footnote is dropped (the film
// carries the disclosure); the price scale glides instead of jumping. Prices, prints, CVD and the
// position's stop/target are the page's own.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { newLab, PROJECT, REPO, shot, startServer, TAPE } from "./rig.mjs";

const CHECK = process.argv.includes("--check");
const ONLY = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const FPS = 30;
const OUT = join(PROJECT, CHECK ? ".tape/check" : "assets/video");
mkdirSync(OUT, { recursive: true });
const T = JSON.parse(readFileSync(join(PROJECT, "assets/audio/vo/timeline.json"), "utf8"));
const data = readFileSync(join(TAPE, "case.data.json"));
const at = (hms) => `2026-11-05T${hms}+08:00`;
const ms = (hms) => Date.parse(at(hms));

const OFF = { profile: false, dprofile: false, heat: false, dom: false, prints: false, stack: false, vwap: false, levels: false, liqmark: false, events: false, lmap: false, stats: false, volume: false, delta: false, cvd: false, scvd: false, liq: false, oi: false, doi: false, funding: false, premium: false, ratio: false, top: false, imb: false };
const PANES = { ...OFF, cvd: true, scvd: true };
// The levels of the plan (SPEC.md): the POC the price held, the VAL the owner's screen showed at
// 20:45, and the POC of 11/01 07:00 → 11/05 21:45 below.
const POC = { id: "poc", price: 80400, label: "POC 80,400", color: "gold" };
const VAL = { id: "val", price: 79855, label: "VAL 79,855 · 畫面上約一天的成交量分布", color: "text" };
const STOP = { ...POC, label: "停損 80,400 · 上方 POC", color: "sell" };
const TARGET = { id: "target", price: 77800, label: "目標 77,800 · 下方 POC", color: "buy" };
export const TRADE = { side: "short", entry: 79850, stop: 80400, target: 77800 };

// A take is a list of waypoints: the replay clock reaches `t` at film time `film` (seconds), with
// any lab step props applied there. Moving between two waypoints sets the replay speed; a waypoint
// at the same replay time as the one before freezes the clock (a hold) until its film time.
// The pre-roll runs fast from 16:00 and stops exactly at `roll` on a 1 ms hold, so no frame of the
// take overshoots. A step's speed applies from the step on; a hold freezes the clock at the step.
// `pre` are steps that fire during the pre-roll (lines and a position already on the chart).
function plan(film0, film1, roll, view, points, pre = []) {
  const iso = (v) => new Date(v).toISOString();
  const steps = [{ at: at("16:00:00"), speed: 3000, caption: "", ...view }, ...pre];
  let curT = ms(roll);
  let cur = { at: iso(curT), hold: 1, speed: 1 };
  let prevF = film0;
  for (const p of points) {
    const { t, film, ...props } = p;
    const dr = ms(t) - curT;
    const df = (film - prevF) * 1000;
    if (dr > 0) {
      cur.speed = dr / df;
      steps.push(cur);
      curT = ms(t);
    } else {
      // Freeze here until the waypoint's film time, then creep 1 ms on (steps need distinct times).
      cur.hold = (cur.hold ?? 0) + Math.round(df);
      cur.speed = 1;
      steps.push(cur);
      curT += 1;
    }
    cur = { at: iso(curT), ...props };
    prevF = film;
  }
  steps.push({ ...cur, hold: Math.round((film1 - prevF) * 1000) + 2000, speed: 0.001 });
  return { roll, ms: Math.round((film1 - film0) * 1000) + 300, steps };
}

const highs = [
  { id: "h1", at: at("16:37:30"), price: 80629, text: "80,629" },
  { id: "h2", at: at("18:22:30"), price: 80518, text: "80,518" },
  { id: "h3", at: at("19:22:30"), price: 80420, text: "80,420" },
];
const noTouch = [
  { id: "w1", at: at("20:52:30"), price: 79800, text: "高 79,800" },
  { id: "w2", at: at("21:07:30"), price: 79747, text: "高 79,747" },
  { id: "w3", at: at("21:22:30"), price: 79732, text: "高 79,732" },
  { id: "w4", at: at("21:37:30"), price: 79755, text: "高 79,755" },
];
// On "And CVD stays pinned", each waiting bar's note adds its Delta (全市場, BTC): heavy selling in
// the first two, barely positive in the last two, so CVD never climbs back.
const deltas = ["−2,211", "−421", "+223", "+280"];
const withDelta = noTouch.map((n, k) => ({ ...n, text: `${n.text}
Δ ${deltas[k]}` }));
const l4 = T.lines.find((l) => l.n === 4).at;

const SHOTS = {
  context: plan(T.context, T.brk, "20:00:00", { tf: "15", mode: "candles", barW: 20, ind: OFF, line: POC }, [
    ...highs.map((h, k) => ({ t: "20:00:00", film: l4 + 0.35 + k * 0.45, note: h })),
    { t: "20:00:00", film: T.panesCvd, ind: { ...OFF, cvd: true } },
    { t: "20:00:00", film: T.panesSpot, ind: PANES },
  ]),
  break: plan(T.brk, T.plan, "20:15:00", { tf: "15", mode: "candles", barW: 20, ind: PANES, printMin: 150, line: POC }, [
    { t: "20:15:00", film: T.brk + 0.3, ind: { ...PANES, prints: true } },
    { t: "20:31:15", film: T.hits },
    { t: "20:45:00", film: T.valueArea + 1.2 },
  ]),
  plan: plan(T.plan, T.wait, "20:45:00", { tf: "15", mode: "candles", barW: 9, ind: { ...OFF, cvd: true }, line: POC }, [
    { t: "20:45:00", film: T.val, line: VAL },
    { t: "20:45:00", film: T.retest + 0.4, note: { id: "back", at: at("20:37:30"), price: 79855, text: "回到這裡就空", side: "below" } },
    { t: "20:45:00", film: T.stop, line: STOP, clear: ["note:back"] },
    { t: "20:45:00", film: T.target, line: TARGET },
  ]),
  wait: plan(T.wait, T.entry, "20:45:00", { tf: "15", mode: "candles", barW: 95, ind: PANES, line: VAL }, [
    ...noTouch.map((n, k) => ({ t: ["21:00:00", "21:15:00", "21:30:00", "21:45:00"][k], film: T.candles[k], note: n })),
    ...withDelta.map((n, k) => ({ t: "21:45:00", film: T.cvdLow + 0.3 + k * 0.3, note: n })),
  ], [
    { at: at("16:00:01"), line: STOP },
    { at: at("16:00:02"), line: TARGET },
  ]),
  entry: plan(
    T.entry,
    T.result,
    "21:45:00",
    { tf: "15", mode: "candles", barW: 45, ind: PANES, line: VAL },
    [
      // The 21:47 minute (high 79,856) is in once the clock passes it.
      { t: "21:48:00", film: T.touch + 0.6 },
      { t: "21:48:00", film: T.short, position: TRADE, clear: ["line:poc", "line:target"] },
    ],
    [
      { at: at("16:00:01"), line: STOP },
      { at: at("16:00:02"), line: TARGET },
    ],
  ),
  // The position opened at 21:48, at this take's roll, so its box spans from the entry.
  result: plan(T.result, T.end, "21:48:00", { tf: "15", mode: "candles", barW: 22, ind: PANES, line: VAL }, [
    { t: "23:01:00", film: T.reaches },
    { t: "23:02:00", film: T.reaches + 0.6 },
  ], [{ at: at("21:47:59"), position: TRADE }]),
};

const patchApp = (text) => {
  const src = text.split("\r\n").join("\n");
  const foot = /\n[^\n]*ctx\.fillText\(`歷史資料回放[^\n]*\n/;
  const range = "  lo -= pad;\n  hi += pad;\n  lastAuto = { lo, hi };\n";
  // The replay steps by animation-frame time, and every screenshot adds frames of its own; here it
  // steps exactly what the recorder hands it (window.__step), once, so a take is the same every run.
  const loop = "  const dt = Math.min(250, now - replay.last);\n";
  // Case replays are always Binance in the lab; this one is the platform's 全市場 record.
  const exLegend = 'replay || EX === "binance" ? "Binance" : EXN';
  const exHead = '"永續 · Binance"';
  if (!foot.test(src) || !src.includes(range) || !src.includes(loop) || !src.includes(exLegend) || !src.includes(exHead)) throw new Error("app.js changed; update patchApp");
  return src
    .replace(exLegend, 'replay ? "全市場" : EX === "binance" ? "Binance" : EXN')
    .replace(exHead, '"永續 · 全市場"')
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
for (const [name, take] of Object.entries(SHOTS)) {
  if (ONLY.length && !ONLY.includes(name)) continue;
  const lab = await newLab({ scale: CHECK ? 1 : undefined });
  const { page } = lab;
  const script = { title: "11/05", date: "2026-11-05", tz: "+08:00", data: "2026-11-05.data.json", steps: take.steps };
  await page.route("**/cases/2026-11-05.json", (r) => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(script) }));
  await page.route("**/cases/2026-11-05.data.json", (r) => r.fulfill({ status: 200, contentType: "application/json", body: data }));
  await page.route("**/lab/orderflow/app.js", (r) => r.fulfill({ status: 200, contentType: "text/javascript", body: patchApp(readFileSync(join(REPO, "public/lab/orderflow/app.js"), "utf8")) }));
  await page.clock.install({ time: Date.parse("2026-11-08T00:00:00Z") });
  await page.goto(lab.url("?case=2026-11-05"), { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => document.getElementById("status")?.hidden === true, null, { timeout: 60_000 });
  await page.evaluate(() => document.fonts.ready);
  await page.addStyleTag({ content: "#caption,#replay,#live,#zoom-out,#zoom-in,#latest,#narration,#pen-tools{display:none!important}" });
  await page.evaluate(() => document.getElementById("rp-play").click());
  const roll = ms(take.roll);
  let n = 0;
  const step = () => page.evaluate((d) => (window.__step = d), 1000 / FPS);
  while ((await clockOf(page)) < roll) {
    await step();
    await page.clock.runFor(1000 / FPS);
    if (++n > 5000) throw new Error(`${name}: pre-roll did not reach ${take.roll}`);
  }
  const log = [];
  await shot({ page, file: join(OUT, `${name}.mp4`), fps: FPS, ms: take.ms, check: CHECK, checkEvery: FPS, beforeFrame: step, onFrame: async (f) => log.push([f, (await page.textContent("#rp-clock")).slice(-8)]) });
  logs[name] = log;
  await lab.browser.close();
}
srv.stop();
writeFileSync(join(TAPE, `shots-log${CHECK ? "-check" : ""}.json`), JSON.stringify(logs));
for (const [name, log] of Object.entries(logs)) console.log(name, log.filter((_, i) => i % FPS === 0).map((x) => `${(x[0] / FPS).toFixed(0)}s ${x[1]}`).join(" | "));
