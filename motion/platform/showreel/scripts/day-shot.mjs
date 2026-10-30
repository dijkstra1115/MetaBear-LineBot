// Records dive.mp4: the real lab, driven by its replay engine but framed like a live screen. The
// day's earlier trades sit on the chart, the 20:58 long stops out, the 21:10 long reaches its target.
// node scripts/day-shot.mjs [--check]
//
// Capture-only changes, served to this browser and nowhere else: the replay controls, the
// "歷史回放中" badge and the chart's replay footnote are hidden, and closed position boxes stay on
// the chart. Prices, trades and the stop and target hits are the page's own, from the Binance seconds.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { CURSOR, newLab, PROJECT, REPO, shot, startServer, TAPE } from "./lab-rig.mjs";
import { loadPlan } from "./take-plan.mjs";

const CHECK = process.argv.includes("--check");
const SCALE = CHECK ? 1 : 2;
const FPS = 60;
const OUT = join(PROJECT, CHECK ? ".tape/check" : "assets/video");
mkdirSync(OUT, { recursive: true });
const iso = (t) => new Date(t).toISOString();
const taipei = (s) => Date.parse(`${s}+08:00`);
const IND = { profile: false, prints: true, vwap: true, levels: false, events: false, lmap: false, stack: false, stats: false, volume: true, delta: false, cvd: false, oi: false, doi: false, funding: false, ratio: false, imb: false };

const patchReplay = (text) => {
  const src = text.split("\r\n").join("\n");
  const a = 'const blank = () => ({ speed: 10, caption: "",';
  const b = "if (step.position) {\n      const p = step.position;";
  const c = "  const p = s.position;\n  if (p) {";
  if (!src.includes(a) || !src.includes(b) || !src.includes(c)) throw new Error("replay.js changed; update patchReplay");
  return src
    .replace(a, 'const blank = () => ({ closed: [], speed: 10, caption: "",')
    .replace(b, "if (step.position) {\n      this.settle();\n      if (s.position?.exit) s.closed.push(s.position);\n      const p = step.position;")
    .replace(
      c,
      `  for (const q of s.closed) {
    const x0 = xAt(q.openT) ?? 0;
    const x1 = Math.min(plotW, xAt(q.exit.t) ?? plotW);
    const yE = yOf(q.entry), yT = yOf(q.target), yS = yOf(q.stop);
    ctx.fillStyle = \`rgba(\${RGB.buy},\${q.exit.won ? 0.2 : 0.09})\`;
    ctx.fillRect(x0, Math.min(yE, yT), x1 - x0, Math.abs(yT - yE));
    ctx.fillStyle = \`rgba(\${RGB.sell},\${q.exit.won ? 0.09 : 0.22})\`;
    ctx.fillRect(x0, Math.min(yE, yS), x1 - x0, Math.abs(yS - yE));
    ctx.strokeStyle = \`rgba(\${RGB.text},0.6)\`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x0, Math.round(yE) + 0.5);
    ctx.lineTo(x1, Math.round(yE) + 0.5);
    ctx.stroke();
  }
` + c,
    );
};
const patchApp = (text) => {
  const src = text.split("\r\n").join("\n");
  const foot = /\n[^\n]*ctx\.fillText\(`歷史資料回放[^\n]*\n/;
  if (!foot.test(src)) throw new Error("app.js changed; update patchApp");
  return src.replace(foot, "\n");
};

const { data, seg, t1, t2, t3, t4, pins } = loadPlan();
const pos = (t) => ({ side: t.dir, entry: t.entry, stop: t.stop, target: t.tp });
const speed = (k) => (pins[k + 1][1] - pins[k][1]) / ((pins[k + 1][0] - pins[k][0]) * 1000);
const VIEW5 = { tf: "5", mode: "candles", barW: 8.3, printMin: 25 };
const steps = [
  // Pre-roll, off camera: the day's first two trades go by so their boxes are on the chart.
  { at: iso(data.start), speed: 30000, ...VIEW5, ind: IND, caption: "", line: { id: "level", price: seg.lines[0].price, label: "9/12 高點 77,477" } },
  { at: iso(t1.fill), position: pos(t1) },
  { at: iso(t2.fill), position: pos(t2) },
  { at: iso(taipei("2026-09-14T20:00:00")), speed: 3000 },
  { at: iso(taipei("2026-09-14T20:40:00")), speed: 300 },
  // The take.
  { at: iso(pins[0][1]), speed: speed(0) },
  { at: iso(pins[1][1]), speed: speed(1), position: pos(t3) },
  { at: iso(pins[2][1]), speed: speed(2), tf: "1", mode: "footprint", barW: 110, printMin: 25 },
  { at: iso(pins[3][1]), speed: speed(3) },
  { at: iso(pins[4][1]), speed: speed(4), position: pos(t4), box: { id: "stack", from: "21:09", to: "21:10", high: 77530, low: 77490, label: "買方失衡堆疊" } },
  { at: iso(pins[5][1]), speed: speed(5), tf: "5", mode: "candles", barW: 30, clear: ["box:stack"] },
  { at: iso(pins[6][1]), speed: speed(6) },
  { at: iso(pins[7][1]), speed: speed(7) },
  { at: iso(pins[8][1]), end: true },
];
const SCRIPT = { title: "9/14", date: "2026-09-14", tz: "+08:00", data: "2026-09-14.data.json", steps };

const srv = startServer();
await srv.ready;
const lab = await newLab({ scale: SCALE });
const { page } = lab;
await page.route("**/cases/2026-09-14.json", (r) => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(SCRIPT) }));
await page.route("**/cases/2026-09-14.data.json", (r) => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(data) }));
await page.route("**/lab/orderflow/replay.js", (r) => r.fulfill({ status: 200, contentType: "text/javascript", body: patchReplay(readFileSync(join(REPO, "public/lab/orderflow/replay.js"), "utf8")) }));
await page.route("**/lab/orderflow/app.js", (r) => r.fulfill({ status: 200, contentType: "text/javascript", body: patchApp(readFileSync(join(REPO, "public/lab/orderflow/app.js"), "utf8")) }));
await page.clock.install({ time: Date.parse("2026-10-20T00:00:00Z") });
await page.goto(lab.url("?case=2026-09-14"), { waitUntil: "domcontentloaded" });
await page.waitForFunction(() => document.getElementById("status")?.hidden === true, null, { timeout: 120_000 });
await page.evaluate(() => document.fonts.ready);
await page.addStyleTag({ content: "#caption,#replay,#live{display:none!important}" });
await page.evaluate(CURSOR);
await page.clock.pauseAt(new Date((await page.evaluate(() => Date.now())) + 50));
await page.evaluate(() => document.getElementById("rp-play").click());
// Run the pre-roll until the clock reaches the take's first pin, then the camera rolls.
const dt = 1000 / FPS;
const reached = async () => {
  const [, h, m, s] = (await page.textContent("#rp-clock")).match(/(\d\d):(\d\d):(\d\d)/);
  return Date.parse(`2026-09-14T${h}:${m}:${s}+08:00`) >= pins[0][1];
};
let frames = 0;
while (!(await reached())) {
  await page.clock.runFor(dt);
  if (++frames > 3000) throw new Error("pre-roll did not reach the take");
}
console.log(`pre-roll ${frames} frames, clock ${await page.textContent("#rp-clock")}`);
const log = [];
await shot({
  page,
  file: join(OUT, "dive.mp4"),
  fps: FPS,
  ms: (pins[pins.length - 1][0] + 0.3) * 1000,
  check: CHECK,
  onFrame: async (f) => {
    log.push([f, await page.textContent("#rp-clock")]);
  },
});
await lab.browser.close();
srv.stop();
writeFileSync(join(TAPE, "dive-log.json"), JSON.stringify({ log, pins }));
console.log(log.filter((_, i) => i % 60 === 0).map((x) => x.join(" ")).join(" | "));
