// Builds index.html from scripts/template.html, the extracted data and the narration cues.
// Run from this folder: node scripts/build.mjs
import { readFile, writeFile } from "node:fs/promises";
import { C, END, CAPTIONS, EV_DUR, EV_T0 } from "./cues.mjs";

const data = JSON.parse(await readFile("assets/data/replay.json", "utf8"));
let html = await readFile("scripts/template.html", "utf8");
const S10 = +(C.s10 - 0.1).toFixed(3);
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
const values = {
  "{{END}}": END,
  "{{S10}}": S10,
  "{{S10LEN}}": +(END - S10).toFixed(3),
  "{{EVDUR}}": EV_DUR,
  "/*@EVT0*/ null": JSON.stringify(EV_T0),
  "{{CAPTIONS_HTML}}": CAPTIONS.map(([, , t], i) => `        <div class="cap" id="cap${i}">${esc(t)}</div>`).join("\n"),
  "/*@DATA*/ null": JSON.stringify(data),
  "/*@CUES*/ null": JSON.stringify(C),
  "/*@CAPTIONS*/ null": JSON.stringify(CAPTIONS.map(([a, b]) => [a, b])),
};
for (const [k, v] of Object.entries(values)) html = html.split(k).join(String(v));
await writeFile("index.html", html);
console.log(`index.html: ${END}s, ${CAPTIONS.length} captions`);
