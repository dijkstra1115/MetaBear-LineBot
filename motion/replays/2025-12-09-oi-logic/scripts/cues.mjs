// Film timing, derived from the ElevenLabs character timestamps (scripts/.align/<id>.json).
// Each scene's narration is sped up by SPEED (pitch kept) and starts LEAD after its scene
// starts; scenes follow each other GAP after the previous narration ends.
import { readFileSync } from "node:fs";
import { SCENES } from "./script.mjs";

export const SPEED = 1.0;
const LEAD = { hook: 0.3 };
const GAP = { setup: 0.9, sweep: 0.6, turn: 0.8, reclaim: 0.6, result: 0.6, close: 0.8 };
const TAIL = 3.4; // end card after the last word

const r3 = (v) => +v.toFixed(3);
const align = Object.fromEntries(SCENES.map((s) => [s.id, JSON.parse(readFileSync(`scripts/.align/${s.id}.json`, "utf8"))]));

// Raw start/end (seconds, unscaled) of a spoken substring inside a scene.
function span(id, sub) {
  const a = align[id];
  const i = a.text.indexOf(sub);
  if (i < 0) throw new Error(`${id}: "${sub}" not in narration`);
  let j = i + sub.length - 1;
  while (j > i && /[\s，。：；、？,.:;?!]/.test(a.text[j])) j--;
  return [a.start[i], a.end[j]];
}

export const SCENE = {}; // id → { start, vo, voFile, speechStart, speechEnd, end }
{
  let t = 0;
  for (const [n, s] of SCENES.entries()) {
    const a = align[s.id];
    const first = [...a.text].findIndex((c) => !/\s/.test(c));
    const last = a.text.length - 1 - [...a.text].reverse().findIndex((c) => !/[\s，。：；、？,.:;?!]/.test(c));
    if (n > 0) t += GAP[s.id] ?? 0.45;
    const start = t;
    const speechStart = start + (LEAD[s.id] ?? 0.15);
    const vo = speechStart - a.start[first] / SPEED; // where the file itself is placed
    const speechEnd = vo + a.end[last] / SPEED;
    SCENE[s.id] = { start: r3(start), vo: r3(vo), voFile: `assets/audio/vo/${s.id}.wav`, speechStart: r3(speechStart), speechEnd: r3(speechEnd) };
    t = speechEnd;
  }
  const ids = SCENES.map((s) => s.id);
  ids.forEach((id, i) => (SCENE[id].end = i + 1 < ids.length ? SCENE[ids[i + 1]].start : r3(SCENE[id].speechEnd + TAIL)));
}
export const END = SCENE.close.end;

// Beat marks: C.<scene>.<mark> = film time the spoken substring starts.
export const C = {};
for (const s of SCENES) {
  C[s.id] = { start: SCENE[s.id].start, end: SCENE[s.id].end, speech: SCENE[s.id].speechStart, speechEnd: SCENE[s.id].speechEnd };
  for (const [k, sub] of Object.entries(s.marks)) C[s.id][k] = r3(SCENE[s.id].vo + span(s.id, sub)[0] / SPEED);
}

// Subtitles: [start, end, text]; each ends just before the next begins.
export const CAPTIONS = [];
for (const s of SCENES)
  for (const [shown, spoken] of s.caps) {
    const [a, b] = span(s.id, spoken);
    CAPTIONS.push([r3(SCENE[s.id].vo + a / SPEED - 0.05), r3(SCENE[s.id].vo + b / SPEED + 0.25), shown]);
  }
CAPTIONS.forEach((c, i) => {
  const next = CAPTIONS[i + 1];
  if (next && c[1] > next[0] - 0.04) c[1] = r3(next[0] - 0.04);
});
