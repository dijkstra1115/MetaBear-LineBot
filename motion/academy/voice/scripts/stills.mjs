// One poster frame per available lesson (player stage, 60% through), for the "23 lessons" wall.
// Needs `npm run preview:academy`. Usage: node scripts/stills.mjs
import { chromium } from "playwright";
import fs from "node:fs";
import { courses, isAvailable } from "../../../../public/orderflow/academy-catalog.js";

const list = courses.filter(isAvailable);
fs.mkdirSync("assets/img/lessons", { recursive: true });
const browser = await chromium.launch({ headless: true, args: ["--mute-audio", "--hide-scrollbars"] });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
const meta = [];
for (const c of list) {
  await page.goto(`http://127.0.0.1:8790/orderflow/${c.href.replace("./", "")}`, { waitUntil: "networkidle" });
  await page.waitForFunction(() => window.motionPlayer, null, { timeout: 15000 });
  const D = await page.evaluate(() => { window.motionPlayer.pause(); return Number(document.querySelector(".motion-range").max) / 1000; });
  await page.evaluate((t) => window.motionPlayer.seek(t, false), D * 0.62);
  await page.waitForTimeout(250);
  await page.evaluate(() => document.querySelectorAll(".motion-bigplay,.motion-soundhint,.motion-hud").forEach((e) => (e.style.visibility = "hidden")));
  await (await page.$(".motion-stage")).screenshot({ path: `assets/img/lessons/${c.id}.jpg`, quality: 82 });
  meta.push({ id: c.id, number: c.number, kind: c.kind, title: c.title, duration: c.duration });
}
fs.writeFileSync("assets/img/lessons/lessons.json", JSON.stringify(meta, null, 1));
await browser.close();
console.log(meta.length, "lesson stills");
