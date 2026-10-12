// Builds index.html from scripts/template.html, the extracted data and the narration cues.
// Run from this folder: node scripts/build.mjs
import { readFile, writeFile } from "node:fs/promises";
import { C, END, CAPTIONS } from "./cues.mjs";

const data = JSON.parse(await readFile("assets/data/replay.json", "utf8"));
let html = await readFile("scripts/template.html", "utf8");
const S7 = +(C.s7 - 0.2).toFixed(3);
const S8 = +(C.s8 - 0.3).toFixed(3);
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
const values = {
  "{{END}}": END,
  "{{S7}}": S7,
  "{{S7LEN}}": +(S8 - S7).toFixed(3),
  "{{S8}}": S8,
  "{{S8LEN}}": +(END - S8).toFixed(3),
  "{{CAPTIONS_HTML}}": CAPTIONS.map(([, , t], i) => `        <div class="cap" id="cap${i}">${esc(t)}</div>`).join("\n"),
  "/*@DATA*/ null": JSON.stringify(data),
  "/*@CUES*/ null": JSON.stringify(C),
  "/*@CAPTIONS*/ null": JSON.stringify(CAPTIONS.map(([a, b]) => [a, b])),
};
for (const [k, v] of Object.entries(values)) html = html.split(k).join(String(v));
await writeFile("index.html", html);
console.log(`index.html: ${END}s, ${CAPTIONS.length} captions`);
