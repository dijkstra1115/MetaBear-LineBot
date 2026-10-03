#!/usr/bin/env node
// Captures the live FLOW ARENA cockpit for the film's product shot (assets/cockpit.jpg).
// Needs the local site preview: `npm run preview:academy` (http://127.0.0.1:8790).
//   node motion/flow-arena/flagship/capture.mjs [--seed 4821] [--base http://127.0.0.1:8790]
import { writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i < 0 ? fallback : args[i + 1];
};
const base = opt("base", "http://127.0.0.1:8790");
const seed = opt("seed", "4821");

const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
await page.goto(`${base}/arena/?seed=${seed}&debug`);
await page.waitForTimeout(2500);
await page.getByText("先不用").click();
await page.waitForTimeout(600);
// A 1,250 BTC market buy on the first turn, then execute / continue through tactical pauses until
// the push has carried the price into the short fuel (about 30 s of play on seed 4821).
await page.keyboard.press("4");
await page.keyboard.press("q");
await page.waitForTimeout(300);
await page.keyboard.press("Space");
for (let i = 0; i < Number(opt("steps", 12)); i++) {
  await page.waitForTimeout(2500);
  await page.keyboard.press("Space");
}
await page.waitForTimeout(2500);
const shot = await page.screenshot({ type: "jpeg", quality: 90 });
await writeFile(join(here, "assets/cockpit.jpg"), shot);
console.log("assets/cockpit.jpg");
await browser.close();
