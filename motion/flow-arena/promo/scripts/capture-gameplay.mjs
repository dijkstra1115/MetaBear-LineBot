// Records a real FLOW ARENA round for the promo: GPU headless Chrome screencast (30fps) + cursor log + result dialog.
// Needs `npm run preview:academy` on :8790, ffmpeg on PATH, and puppeteer-core/Chrome paths adjusted below.
// Usage: node scripts/capture-gameplay.mjs <out-dir> [attempts]  (keep the attempt with a positive result)
import * as P from "file:///C:/Users/style/AppData/Local/npm-cache/_npx/110f701c48e68d66/node_modules/puppeteer-core/lib/puppeteer/puppeteer-core.js";
const puppeteer = P.default ?? P;
import fs from "node:fs";
const OUT = process.argv[2];
const ATTEMPTS = Number(process.argv[3] || 3);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({
  executablePath: "C:/Users/style/.cache/puppeteer/chrome/win64-148.0.7778.97/chrome-win64/chrome.exe",
  headless: true,
  args: ["--mute-audio", "--use-gl=angle", "--use-angle=d3d11", "--enable-gpu-rasterization", "--ignore-gpu-blocklist"],
});
const results = [];
for (let a = 0; a < ATTEMPTS; a++) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1 });
  await page.goto("http://localhost:8790/orderflow/challenge.html", { waitUntil: "networkidle0" });
  await sleep(1200);
  await page.click("#play-button");
  await sleep(6500);
  const box = async (sel) => page.$eval(sel, (e) => { const r = e.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2, r.x, r.y, r.width, r.height]; });
  const chart = await box("#market-chart");
  const qty = await page.$$eval(".quick-size button", (bs) => bs.map((e) => { const r = e.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; }));
  const fuel = await page.evaluate(() => {
    const n = (id) => Number((document.getElementById(id)?.textContent || "0").replace(/[^\d.]/g, "")) || 0;
    return { short: n("fuel-short"), long: n("fuel-long") };
  });
  const dir = fuel.short >= fuel.long ? "buy" : "sell";
  const actBtn = await box(dir === "buy" ? "#quick-buy" : "#quick-sell");
  const closeBtn = await box("#close-position");
  const log = [];
  let t0 = Date.now();
  const T = () => (Date.now() - t0) / 1000;
  let mx = chart[2] + chart[4] * 0.9, my = chart[3] + chart[5] * 0.9;
  const move = async (x, y, dur, tag) => {
    const steps = Math.max(2, Math.round(dur / 0.033));
    const x0 = mx, y0 = my;
    for (let i = 1; i <= steps; i++) {
      const k = i / steps, e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
      mx = x0 + (x - x0) * e; my = y0 + (y - y0) * e;
      await page.mouse.move(mx, my);
      log.push({ t: T(), x: mx, y: my });
      await sleep(33);
    }
    if (tag) log.push({ t: T(), x: mx, y: my, ev: tag });
  };
  const click = async (tag) => { log.push({ t: T(), x: mx, y: my, ev: "click", tag }); await page.mouse.down(); await sleep(60); await page.mouse.up(); };
  const rec = await page.screencast({ path: `${OUT}/a${a}.mp4`, format: "mp4", fps: 30, quality: 18 });
  t0 = Date.now();
  await page.mouse.move(mx, my);
  await sleep(300);
  // sweep the chart like reading the heatmap
  await move(chart[2] + chart[4] * 0.62, chart[3] + chart[5] * 0.12, 1.1);
  await move(chart[2] + chart[4] * 0.62, chart[3] + chart[5] * 0.62, 0.9);
  await sleep(250);
  // hover quantity buttons then pick 5,000
  for (let i = 0; i < 4; i++) await move(qty[i][0], qty[i][1], i ? 0.22 : 0.45, "hover-qty-" + i);
  await sleep(150); await click("qty5000"); await sleep(250);
  await move(actBtn[0], actBtn[1], 0.35, "hover-act");
  await sleep(200); await click(dir);
  // ride the chain; close on the first stall with profit, or at 5s
  let best = -1e18, closeAt = 0;
  for (let k = 0; k < 26; k++) {
    await sleep(200);
    const pnl = await page.evaluate(() => Number((document.getElementById("position-hud-pnl")?.textContent || "0").replace(/[^\d.-]/g, "")) || 0);
    best = Math.max(best, pnl);
    if (k > 10 && pnl > 0 && pnl < best * 0.9) { closeAt = k; break; }
  }
  await move(closeBtn[0], closeBtn[1], 0.3, "hover-close");
  await sleep(150); await click("close");
  await sleep(1800);
  await rec.stop();
  const clip = { a, dir, fuel, best, log, chart, qty, actBtn, closeBtn };
  // finish the round quickly
  await page.select("#speed", "4");
  for (let k = 0; k < 70; k++) {
    await sleep(1000);
    const open = await page.evaluate(() => { const d = document.getElementById("result-dialog"); return !!d && d.getBoundingClientRect().height > 50; });
    if (open) break;
  }
  await sleep(1200);
  const res = await page.evaluate(() => ({ score: document.getElementById("result-score")?.textContent, grade: document.getElementById("result-grade")?.textContent, pnl: document.getElementById("result-pnl")?.textContent, ignited: document.getElementById("result-ignited")?.textContent }));
  clip.res = res;
  await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 2 });
  await sleep(800);
  const dlg = await page.$("#result-dialog");
  if (dlg) await dlg.screenshot({ path: `${OUT}/a${a}-dialog.png` });
  clip.dialogParts = await page.evaluate(() => {
    const d = document.getElementById("result-dialog"); if (!d) return [];
    const b = d.getBoundingClientRect();
    return [...d.querySelectorAll("*")].filter((e) => e.children.length && e.getBoundingClientRect().height > 30).slice(0, 80).map((e) => { const r = e.getBoundingClientRect(); return [e.tagName.toLowerCase() + (e.id ? "#" + e.id : "") + "." + String(e.className).split(" ")[0], Math.round(r.x - b.x), Math.round(r.y - b.y), Math.round(r.width), Math.round(r.height)]; });
  });
  fs.writeFileSync(`${OUT}/a${a}.json`, JSON.stringify(clip, null, 1));
  console.log("attempt", a, dir, JSON.stringify(res), "best floating", best);
  await page.close();
}
await browser.close();
