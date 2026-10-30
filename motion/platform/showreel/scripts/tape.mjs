// Tapes the live lab once: every API response and WebSocket frame for `--ms`, plus a look at each
// exchange view so their responses are on the tape too. Run from this folder: node scripts/tape.mjs
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { newLab, recordSockets, startServer, TAPE, tapeApi } from "./lab-rig.mjs";

const ms = Number(process.argv[process.argv.indexOf("--ms") + 1]) || 120_000;
rmSync(TAPE, { recursive: true, force: true });
mkdirSync(TAPE, { recursive: true });
const srv = startServer();
await srv.ready;
const lab = await newLab();
await tapeApi(lab.page);
const rec = await recordSockets(lab.page);
await lab.page.goto(lab.url("?days=5&ex=all"), { waitUntil: "domcontentloaded" });
await lab.page.waitForFunction(() => document.getElementById("status")?.hidden === true, null, { timeout: 90_000 });
await lab.page.waitForTimeout(ms);
writeFileSync(join(TAPE, "still-end.txt"), new Date().toISOString());
await lab.page.screenshot({ path: join(TAPE, "live-end.png") });
rec.save();
await lab.browser.close();

// The other views, for their API responses only; their sockets are not used.
for (const ex of ["binance", "bybit", "okx", "bingx"]) {
  const v = await newLab();
  await tapeApi(v.page);
  await v.page.routeWebSocket(/.*/, () => {});
  await v.page.goto(v.url(`?days=5&ex=${ex}`), { waitUntil: "domcontentloaded" });
  await v.page.waitForFunction(() => document.getElementById("status")?.hidden === true, null, { timeout: 90_000 });
  await v.page.waitForTimeout(1500);
  await v.browser.close();
  console.log("taped", ex);
}
srv.stop();
console.log("done");
