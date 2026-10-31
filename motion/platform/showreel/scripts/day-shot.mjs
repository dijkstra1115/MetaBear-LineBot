// Records dive.mp4: the real lab, driven by its replay engine but framed like a live screen. Four
// longs in a row on 9/14, one take: stop, target, stop, target. The whole take stays on 1-minute bars
// in footprint mode, so going into the footprint is the same chart zooming in: bars never regroup.
// node scripts/day-shot.mjs [--check]
//
// Capture-only changes, served to this browser and nowhere else: the replay controls, the
// "歷史回放中" badge and the chart's replay footnote are hidden, and closed position boxes stay on
// the chart, a speed change takes effect within the frame it falls in, so each event lands on its
// frame, each trade's signal pops up on its bar, layer by layer, the price scale glides instead of
// jumping, and the bar width is driven frame by frame. Prices, trades and the stop and target hits are the page's own, from the Binance seconds.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { CURSOR, newLab, PROJECT, REPO, shot, startServer, TAPE } from "./lab-rig.mjs";
import { S } from "./cues.mjs";
import { loadPlan } from "./take-plan.mjs";

const CHECK = process.argv.includes("--check");
const SCALE = CHECK ? 1 : 2;
const FPS = 60;
const OUT = join(PROJECT, CHECK ? ".tape/check" : "assets/video");
mkdirSync(OUT, { recursive: true });
const iso = (t) => new Date(t).toISOString();
const taipei = (s) => Date.parse(`${s}+08:00`);
const IND = { profile: false, prints: true, vwap: true, levels: false, events: false, lmap: false, stack: false, stats: false, volume: false, delta: false, cvd: false, oi: false, doi: false, funding: false, ratio: false, imb: false };

const patchReplay = (text) => {
  const src = text.split("\r\n").join("\n");
  const a = 'const blank = () => ({ speed: 10, caption: "",';
  const b = "if (step.position) {\n      const p = step.position;";
  const c = "  const p = s.position;\n  if (p) {";
  const d = "      const step = this.steps[this.next++];\n      this.t = step.t;\n      this.apply(step, true);\n";
  const e = "    if (step.end) s.ended = true;\n";
  const f = "  ctx.restore();\n}\n";
  if (!src.includes(a) || !src.includes(b) || !src.includes(c) || !src.includes(d) || !src.includes(e) || src.split(f).length !== 2) throw new Error("replay.js changed; update patchReplay");
  return src
    .replace(e, "    if (step.signal) s.signals.push({ ...step.signal, since });\n" + e)
    .replace(
      f,
      `  // A signal: the stack's layers pop up one by one on the bar, a ring goes out from them, and a tag
  // names it. The tag leaves; the layers stay on the chart as the record of why the trade opened.
  for (const sg of s.signals) {
    const x = xAt(sg.t);
    if (x == null) continue;
    const age = performance.now() - sg.since;
    const wide = g.barW >= 40;
    const cx = x + g.barW / 2;
    const w = Math.max(34, g.barW - 6);
    const yHi = yOf(sg.hi);
    const yLo = yOf(sg.lo);
    const yc = Math.max(top + 34, (yHi + yLo) / 2);
    if (age < 900) {
      ctx.fillStyle = \`rgba(\${RGB.gold},\${(0.2 * (1 - age / 900)).toFixed(3)})\`;
      ctx.fillRect(cx - w / 2, top, w, bottom - top);
    }
    const settled = Math.max(0, Math.min(1, (age - 700) / 500));
    for (let k = 0; k < sg.n; k++) {
      const p = Math.max(0, Math.min(1, (age - k * 62.5) / 110));
      if (!p) continue;
      const cw = w * (1 - (1 - p) ** 3);
      const y0 = yOf(sg.lo + (k + 1) * sg.tick);
      const y1 = yOf(sg.lo + k * sg.tick);
      ctx.save();
      ctx.shadowColor = \`rgba(\${RGB.buy},\${(0.95 * (1 - settled)).toFixed(3)})\`;
      ctx.shadowBlur = 18;
      ctx.fillStyle = \`rgba(\${RGB.buy},\${((wide ? 0.5 : 0.95) - (wide ? 0.2 : 0.4) * settled).toFixed(3)})\`;
      ctx.fillRect(cx - cw / 2, y0, cw, Math.max(4, y1 - y0 - 1));
      ctx.restore();
    }
    for (const delay of [0, 130]) {
      const a = age - delay;
      if (a <= 0 || a >= 560) continue;
      ctx.strokeStyle = \`rgba(\${RGB.gold},\${(0.95 * (1 - a / 560)).toFixed(3)})\`;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(cx, (yHi + yLo) / 2, 12 + (a / 560) * 92, 0, Math.PI * 2);
      ctx.stroke();
    }
    if (age < 1300) {
      const pop = Math.min(1, age / 150);
      ctx.save();
      ctx.globalAlpha = Math.min(1, (1300 - age) / 220);
      const ax = cx - w / 2 - 22;
      ctx.strokeStyle = \`rgb(\${RGB.gold})\`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(ax, yc);
      ctx.lineTo(cx - w / 2, (yHi + yLo) / 2);
      ctx.stroke();
      ctx.translate(ax, yc);
      const scale = 1 + 0.6 * (1 - pop) ** 2;
      ctx.scale(scale, scale);
      ctx.font = \`800 23px "Noto Sans TC", "Microsoft JhengHei", sans-serif\`;
      ctx.textBaseline = "middle";
      const tagW = ctx.measureText("訊號").width + 18;
      const textW = ctx.measureText(sg.text).width;
      const W = tagW + textW + 30;
      ctx.fillStyle = "rgba(5,9,15,0.96)";
      roundRect(ctx, -W, -23, W, 46, 9);
      ctx.fill();
      ctx.strokeStyle = \`rgb(\${RGB.gold})\`;
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = \`rgb(\${RGB.gold})\`;
      roundRect(ctx, -W + 7, -16, tagW, 32, 6);
      ctx.fill();
      ctx.fillStyle = "#1d1405";
      ctx.fillText("訊號", -W + 16, 1);
      ctx.fillStyle = \`rgb(\${RGB.text})\`;
      ctx.fillText(sg.text, -textW - 12, 1);
      ctx.restore();
    }
  }
` + f,
    )
    .replace(d, "      const step = this.steps[this.next++];\n      dtMs -= (step.t - this.t) / this.state.speed;\n      this.t = step.t;\n      this.apply(step, true);\n      target = Math.min(this.data.end, this.t + dtMs * this.state.speed);\n")
    .replace(a, 'const blank = () => ({ closed: [], signals: [], speed: 10, caption: "",')
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
const CELLS = 34; // the bar width at which candles open into footprint cells
const patchApp = (text) => {
  const src = text.split("\r\n").join("\n");
  const foot = /\n[^\n]*ctx\.fillText\(`歷史資料回放[^\n]*\n/;
  const range = "  lo -= pad;\n  hi += pad;\n  lastAuto = { lo, hi };\n";
  const target = 'ui.mode.value === "footprint" ? [] : [position.target]';
  const cells = 'const showCells = ui.mode.value === "footprint" && view.barW >= 14 && rowH >= 3;';
  const hook = "  replayView();\n  const s = player.state;\n";
  if (!foot.test(src) || !src.includes(range) || !src.includes(target) || !src.includes(cells) || !src.includes(hook)) throw new Error("app.js changed; update patchApp");
  return src
    .replace(foot, "\n")
    .replace(range, "  lo -= pad;\n  hi += pad;\n  if (window.__range) {\n    lo = window.__range.lo + (lo - window.__range.lo) * 0.14;\n    hi = window.__range.hi + (hi - window.__range.hi) * 0.14;\n  }\n  window.__range = { lo, hi };\n  lastAuto = { lo, hi };\n")
    .replace(target, `ui.mode.value === "footprint" && view.barW >= ${CELLS} ? [] : [position.target]`)
    .replace(cells, `const showCells = ui.mode.value === "footprint" && view.barW >= ${CELLS} && rowH >= 3;`)
    .replace(hook, "  replayView();\n  window.__frameView?.(view, bars.length, layout().plotW);\n  const s = player.state;\n");
};

const { data, seg, t1, t2, t3, t4, pins } = loadPlan();
const pos = (t) => ({ side: t.dir, entry: t.entry, stop: t.stop, target: t.tp });
const speed = (k) => (pins[k + 1][1] - pins[k][1]) / ((pins[k + 1][0] - pins[k][0]) * 1000);
const VIEW1 = { tf: "1", mode: "footprint", barW: 110, printMin: 40 };
// The chart's own camera, one curve for the whole take: bar width in the page, by film second, eased
// in log space so the zoom feels even, with the newest bar held at a fixed distance from the right.
const BAR_W = [[S.hero, 2.4], [S.hero + 1, 110], [S.entry, 110], [S.entry + 1, 26], [S.tp, 20]];
const MARGIN = [[S.hero, 0.14], [S.hero + 1, 0.34], [S.entry, 0.34], [S.entry + 1, 0.2]];
const frameView = (widths, margins) => {
  const smoothIn = (u) => u * u * u * (u * (6 * u - 15) + 10);
  const at = (t, points) => {
    if (t <= points[0][0]) return points[0][1];
    for (let k = 1; k < points.length; k++) {
      if (t > points[k][0]) continue;
      const [a, va] = points[k - 1];
      const [b, vb] = points[k];
      return Math.exp(Math.log(va) + (Math.log(vb) - Math.log(va)) * smoothIn((t - a) / (b - a)));
    }
    return points.at(-1)[1];
  };
  let first = null;
  window.__frameView = (view, n, plotW) => {
    const t = window.__film ?? -1;
    view.follow = false;
    view.barW = at(t, widths);
    // The chart holds still while the first bars fill it, then scrolls once the newest reaches the margin.
    first ??= n + (plotW * 0.5) / view.barW;
    view.end = Math.max(t < widths[0][0] ? first : 0, n + (at(t, margins) * plotW) / view.barW);
  };
};
const signal = (t) => ({ t: t.entryT, ...t.stack, text: `${t.stack.n} 層買方堆疊` });
const steps = [
  { at: iso(data.start), speed: 3000, ...VIEW1, ind: IND, caption: "", line: { id: "level", price: seg.lines[0].price, label: "9/12 高點 77,477" } },
  // The take.
  { at: iso(pins[0][1]), speed: speed(0) },
  { at: iso(pins[1][1]), speed: speed(1), signal: signal(t1) },
  { at: iso(pins[2][1]), speed: speed(2), position: pos(t1) },
  { at: iso(pins[3][1]), speed: speed(3) },
  { at: iso(pins[4][1]), speed: speed(4), signal: signal(t2) },
  { at: iso(pins[5][1]), speed: speed(5), position: pos(t2) },
  { at: iso(pins[6][1]), speed: speed(6) },
  { at: iso(pins[7][1]), speed: speed(7), signal: signal(t3) },
  { at: iso(pins[8][1]), speed: speed(8), position: pos(t3) },
  { at: iso(pins[9][1]), speed: speed(9) },
  { at: iso(pins[10][1]), speed: speed(10) },
  { at: iso(pins[11][1]), speed: speed(11), signal: signal(t4) },
  { at: iso(pins[12][1]), speed: speed(12), position: pos(t4) },
  { at: iso(pins[13][1]), speed: speed(13) },
  { at: iso(pins[14][1]), speed: speed(14) },
  { at: iso(pins[15][1]), speed: speed(15) },
  { at: iso(pins[16][1]), end: true },
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
await page.addInitScript(({ widths, margins, source }) => new Function("widths", "margins", `(${source})(widths, margins)`)(widths, margins), { widths: BAR_W, margins: MARGIN, source: frameView.toString() });
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
  // A check run looks at the opening and at every stage of the zoom.
  checkFrames: CHECK ? [0.7, 2.5, 3.2, 6, 7.95, 8.2, 8.4, 8.55, 8.7, 8.9, 9.3, 9.7, 10.3, 10.5, 10.7, 11.5].map((t) => Math.round((t + 0.5) * FPS)) : null,
  beforeFrame: (f) => page.evaluate((t) => { window.__film = t; }, f / FPS - 0.5),
  onFrame: async (f) => {
    log.push([f, await page.textContent("#rp-clock")]);
  },
});
await lab.browser.close();
srv.stop();
writeFileSync(join(TAPE, "dive-log.json"), JSON.stringify({ log, pins }));
console.log(log.filter((_, i) => i % 60 === 0).map((x) => x.join(" ")).join(" | "));
