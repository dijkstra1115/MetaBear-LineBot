// Builds index.html for one case from scripts/template.html, its extracted data and the timing.
// Run from this folder: node scripts/build.mjs 2026-09-14
import { readFile, writeFile } from "node:fs/promises";
import { cues } from "./cues.mjs";

const id = process.argv[2];
const D = JSON.parse(await readFile(`assets/data/${id}.json`, "utf8"));
const Q = cues(D);
let html = await readFile("scripts/template.html", "utf8");
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
const day = new Date(D.ones[D.trade.signal][0] + 8 * 3600_000);
const date = `${day.getUTCFullYear()}-${String(day.getUTCMonth() + 1).padStart(2, "0")}-${String(day.getUTCDate()).padStart(2, "0")}`;
const values = {
  "{{END}}": Q.END,
  "{{ENDCARD_AT}}": Q.ENDCARD_AT,
  "{{ENDCARD}}": Q.ENDCARD,
  "{{TITLE}}": esc(D.title),
  "{{TAG}}": esc(D.tag),
  "{{NO}}": D.no,
  "{{DATE}}": date,
  "{{CAPTIONS_HTML}}": Q.CAPTIONS.map(([, , t], i) => `        <div class="cap" id="cap${i}">${esc(t)}</div>`).join("\n"),
  "/*@DATA*/ null": JSON.stringify(D),
  "/*@CUES*/ null": JSON.stringify(Q),
};
for (const [k, v] of Object.entries(values)) html = html.split(k).join(String(v));
await writeFile("index.html", html);
// The mix reads the same timing.
await writeFile("scripts/.cues.json", JSON.stringify(Q));
console.log(`index.html for ${id}: ${Q.END}s (zoom ${Q.ZOOM_AT}s, entry ${Q.EVENTS.find((e) => e.type === "entry").t}s, exit ${Q.EVENTS.find((e) => e.type === "exit").t}s)`);
