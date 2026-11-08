// Builds index.html from scripts/template.html, assets/data/day.json and scripts/cues.mjs.
// Run from this folder: node scripts/build.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { FADE_OUT, SONG_AT, cues } from "./cues.mjs";

const D = JSON.parse(readFileSync("assets/data/day.json", "utf8"));
const C = cues(D);
const fmt = (p) => Math.round(p).toLocaleString("en-US");
const r = (v) => +v.toFixed(3);
const trades = C.trades.map((s, k) => {
  const x = D.trades[k], side = x.long ? "long" : "short", n = x.n;
  const why = x.src === "B-hold" ? `買單 <span class="num">${x.absorb}</span> 顆被吸收` : `<span class="num">${x.stack.length}</span> 層${x.long ? "買" : "賣"}方堆疊`;
  const target = x.src === "B-hold" ? 1 : 2;
  const res = x.result === "tp" ? ["tp", `止盈 <span class="num">+${+x.r.toFixed(2)}R</span>`] : ["stop", `停損 <span class="num">−1R</span>`];
  return `      <div id="t${n}" class="clip" data-start="${r(s.S)}" data-duration="${r(s.E - s.S + s.hold)}" data-track-index="${2 + (k % 2)}" data-track-kind="graphics">
        <div class="block" id="t${n}-block">
          <div class="l1" id="t${n}-l1">${x.name} <span class="num">${fmt(x.level)}</span></div>
          <div class="l2" id="t${n}-l2">${why}</div>
          <div class="l3 num" id="t${n}-l3"><span class="side ${side}">${x.long ? "多" : "空"}</span>${fmt(x.entry)}</div>
          <div class="sub" id="t${n}-sub">停損 ${fmt(x.stop)} · 目標 ${target}R</div>
        </div>
        <div class="res"><div class="stamp ${res[0]}" id="t${n}-stamp" data-layout-allow-overlap><span class="ghost">${res[1]}</span><span class="slice a">${res[1]}</span><span class="slice b">${res[1]}</span><span class="slice c">${res[1]}</span></div></div>
      </div>`;
}).join("\n");
// Sound effects (Pixabay licence, from the HyperFrames bundle; ui-thud from motion/audio-library).
// [file, duration, peak offset in the file, volume]; a hit is placed so its peak lands one frame
// after its picture. The song plays at 0.5, so the gains bring each effect up to the bed.
const FX = {
  thud: ["ui-thud.mp3", 0.36, 0.055, 3.98],
  pop: ["pop.mp3", 0.72, 0.12, 3.98],
  ping: ["ping.mp3", 1.32, 0.324, 3.98],
  glitchA: ["glitch-1.mp3", 2.64, 0.198, 1.4],
  glitchB: ["glitch-3.mp3", 3.1, 0.24, 3.98],
  whoosh: ["whoosh.mp3", 0.575, 0.162, 1.6],
  drop: ["impact-bass-1.mp3", 2.12, 0.073, 0.6],
  swell: ["impact-bass-2.mp3", 2.59, 1.986, 0.55],
  click: ["click-soft.mp3", 0.37, 0.073, 3],
};
function sfx() {
  const cues = [];
  const at = (kind, t, id, track, gain = 1) => cues.push({ kind, t, id, track, gain });
  let tp = 0, stop = 0;
  C.trades.forEach((s, k) => {
    const x = D.trades[k];
    at("whoosh", s.S + 0.2, `fx-fly${x.n}`, 13, k % 2 ? 0.75 : 1);
    at("thud", s.fire, `fx-fire${x.n}`, 11);
    if (x.result === "tp") at(tp++ % 2 ? "ping" : "pop", s.result, `fx-res${x.n}`, 12);
    else at(stop++ % 2 ? "glitchB" : "glitchA", s.result, `fx-res${x.n}`, 12);
  });
  at("drop", C.drop, "fx-drop", 14);
  if (C.switchAt != null) at("click", C.switchAt, "fx-switch", 14);
  at("whoosh", C.recap[0] + 0.3, "fx-recap", 13);
  at("swell", C.endcard[0] + 0.3, "fx-end", 14);
  return cues
    .map(({ kind, t, id, track, gain }) => {
      const [file, dur, peak, vol] = FX[kind];
      const start = r(Math.max(0, t + 1 / 30 - peak));
      return `      <audio id="${id}" src="assets/audio/sfx/${file}" data-start="${start}" data-duration="${dur}" data-volume="${r(vol * gain)}" data-track-index="${track}"></audio>`;
    })
    .join("\n");
}
const values = {
  "{{END}}": r(C.end),
  "{{HOOK_DUR}}": r(C.hookEnd + 0.4),
  "{{SWITCH_AT}}": C.switchAt,
  "{{SWITCH_DUR}}": r(Math.min(2, C.drop - 0.03 - C.switchAt)),
  "{{RECAP_AT}}": r(C.recap[0]),
  "{{RECAP_DUR}}": r(C.recap[1] - C.recap[0]),
  "{{ENDCARD_AT}}": r(C.endcard[0]),
  "{{ENDCARD_DUR}}": r(C.endcard[1] - C.endcard[0]),
  "{{SONG_AT}}": SONG_AT,
  "{{FADE_OUT}}": FADE_OUT,
  "{{TRADES_HTML}}": trades,
  "{{SFX_HTML}}": sfx(),
  "/*@DATA*/ null": JSON.stringify(D),
  "/*@CUES*/ null": JSON.stringify(C),
};
let html = readFileSync("scripts/template.html", "utf8");
for (const [k, v] of Object.entries(values)) html = html.split(k).join(String(v));
writeFileSync("index.html", html);
console.log(`index.html: ${r(C.end)}s; 08:00 switch at ${C.switchAt}s; slots ${C.trades.map((s) => `${s.n}@${r(s.S)}`).join(" ")}`);
