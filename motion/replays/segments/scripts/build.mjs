// Builds index.html from scripts/template.html, the extracted data and the film timing.
// Run from this folder: node scripts/build.mjs 2026-09-14
import { readFile, writeFile } from "node:fs/promises";
import { CAPTIONS, END, ENDCARD, ENDCARD_AT, EVENTS, REVEAL } from "./cues.mjs";

const data = JSON.parse(await readFile(`assets/data/${process.argv[2]}.json`, "utf8"));
let html = await readFile("scripts/template.html", "utf8");
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
const values = {
  "{{END}}": END,
  "{{RANGE}}": data.range,
  "{{DAYS}}": [...new Set(data.trades.map((t) => new Date(t.entryT + 8 * 3600_000).toISOString().slice(0, 10)))].join(" 至 "),
  "{{ENDCARD_AT}}": ENDCARD_AT,
  "{{ENDCARD}}": ENDCARD,
  "{{CAPTIONS_HTML}}": CAPTIONS.map(([, , t], i) => `        <div class="cap" id="cap${i}">${esc(t)}</div>`).join("\n"),
  "/*@DATA*/ null": JSON.stringify(data),
  "/*@REVEAL*/ null": JSON.stringify(REVEAL),
  "/*@EVENTS*/ null": JSON.stringify(EVENTS),
  "/*@CAPTIONS*/ null": JSON.stringify(CAPTIONS.map(([a, b]) => [+a.toFixed(3), +b.toFixed(3)])),
};
for (const [k, v] of Object.entries(values)) html = html.split(k).join(String(v));
await writeFile("index.html", html);
console.log(`index.html: ${END}s, end card at ${ENDCARD_AT}s, ${CAPTIONS.length} captions`);
