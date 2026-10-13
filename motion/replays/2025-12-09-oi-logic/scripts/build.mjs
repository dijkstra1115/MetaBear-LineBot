// Builds index.html and compositions/*.html from src/templates/, the extracted data and the
// narration cues. Run from this folder: node scripts/build.mjs
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { C, CAPTIONS, END } from "./cues.mjs";

const data = JSON.parse(readFileSync("assets/data/case.json", "utf8"));
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
const K = JSON.stringify({ C, END, CAPTIONS: CAPTIONS.map(([a, b]) => [a, b]) });
const r3 = (v) => +v.toFixed(3);

// Sub-compositions declare the same @font-face rules as index.html (same root-relative URLs, so the
// duplicates resolve to the same files); without them lint cannot tell the fonts are shipped.
const FONTS = readFileSync("src/templates/index.html", "utf8").match(/(\s*@font-face \{[\s\S]*?\}\n)+/)[0].replace(/^\n/, "");

mkdirSync("compositions", { recursive: true });
for (const name of ["close", "captions"]) {
  let html = readFileSync(`src/templates/${name}.html`, "utf8").replace("/*@K*/ null", K).replace("<style>\n", `<style>\n${FONTS}`);
  if (name === "captions") html = html.replace("<!--@LINES-->", CAPTIONS.map(([, , t], i) => `<div class="captions-line" id="captions-${i}">${esc(t)}</div>`).join("\n          "));
  writeFileSync(`compositions/${name}.html`, html);
}

// The picture is one inline script: data and cues go in as literals (no fetches at render time).
const closeStart = r3(C.close.academy - 0.3);
const vars = { "{{END}}": END, "{{CLOSE_START}}": closeStart, "{{CLOSE_LEN}}": r3(END - closeStart) };
let index = readFileSync("src/templates/index.html", "utf8").replace("/*@DATA*/ null", JSON.stringify(data)).replace("/*@CUES*/ null", JSON.stringify(C));
for (const [k, v] of Object.entries(vars)) index = index.replaceAll(k, String(v));
writeFileSync("index.html", index);
console.log(`index.html: ${END}s, ${CAPTIONS.length} captions`);
