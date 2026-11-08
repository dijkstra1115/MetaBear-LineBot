// The film's clock: where each narration take sits, when each line starts (its subtitle), and the
// spoken words that the footage and overlays land on. Everything else (shots.mjs, build.mjs,
// mix.py) reads these numbers, so a re-recorded take moves the whole film with it.
// node scripts/timeline.mjs → prints the schedule and writes assets/audio/vo/timeline.json
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const PROJECT = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const VO = join(PROJECT, "assets/audio/vo");
const script = JSON.parse(readFileSync(join(PROJECT, "scripts/script.json"), "utf8"));
const words = JSON.parse(readFileSync(join(VO, "words.json"), "utf8"));
const takes = JSON.parse(readFileSync(join(VO, "cues.json"), "utf8"));

// Silence before each take (s): longer before a new scene, short between thoughts.
const GAP = { 0: 0.3, 1: 0.9, 2: 0.6, 3: 0.5, 4: 0.5, 5: 1.0, 6: 1.0, 7: 0.5, 8: 0.9, 9: 0.9, 10: 0.6, 11: 1.0 };
// "…the selling kicks back in. Short." A little more air before "Short." than the take gives it.
export const SHORT_PAUSE = 0.3;
const END_CARD = 3.6;

const norm = (w) => w.toLowerCase().replace(/[^a-z0-9]/g, "");
// The start of `phrase` (one or two words) in a take. Whisper may hear an inflection ("prices"
// for "Price"), so a shared stem is enough; two words keep "The target" from matching "the plan".
const wordAt = (id, phrase, after = 0) => {
  const same = (w, x) => !!norm(w) && (norm(w).startsWith(norm(x)) || norm(x).startsWith(norm(w)));
  const want = phrase.split(/\s+/);
  const list = words[id];
  const i = list.findIndex(([w, a], k) => a >= after && want.every((x, j) => list[k + j] && same(list[k + j][0], x)));
  if (i < 0) throw new Error(`take ${id}: no "${phrase}" after ${after}s`);
  return list[i][1];
};

let t = 0;
const placed = {};
const lines = [];
for (const chunk of script.chunks) {
  t += GAP[chunk.id];
  const take = takes[chunk.id];
  let split = null;
  if (chunk.id === 9) split = wordAt(9, "short") - 0.08;
  placed[chunk.id] = { at: round(t), file: take.file, duration: take.duration, split };
  // Each line starts at its first word, found in order through the take.
  let after = 0;
  for (const line of chunk.lines) {
    // Numbers come back as digits ("At 1101"), so a line whose second word is a number matches by its first.
    const [w1, w2] = line.en.split(/\s+/);
    // A line that opens on a spoken time ("Eleven oh one" heard as "1101,") starts on the word
    // after the previous line's last word.
    const prev = chunk.lines[chunk.lines.indexOf(line) - 1];
    const afterPrev = () => {
      const last = prev.en.split(/\s+/).at(-1);
      const list = words[chunk.id];
      const k = list.findIndex(([x, s]) => s >= after - 0.01 && norm(x) === norm(last));
      if (k < 0 || !list[k + 1]) throw new Error(`take ${chunk.id}: cannot place "${line.en}"`);
      return list[k + 1][1];
    };
    const find = () => {
      for (const f of [() => wordAt(chunk.id, `${w1} ${w2}`, after), () => wordAt(chunk.id, w1, after), afterPrev]) {
        try {
          return f();
        } catch {}
      }
      throw new Error(`take ${chunk.id}: cannot place "${line.en}"`);
    };
    const a = line === chunk.lines[0] ? 0 : find();
    after = a + 0.01;
    const shift = split != null && a >= split ? SHORT_PAUSE : 0;
    lines.push({ n: line.n, at: round(t + a + shift), en: line.en, zh: line.zh, claim: !!chunk.claim });
  }
  t += take.duration + (split != null ? SHORT_PAUSE : 0);
}
for (let k = 0; k < lines.length; k++) lines[k].until = round(k + 1 < lines.length ? lines[k + 1].at - 0.05 : t + 0.4);

const at = (id) => placed[id].at;
const w = (id, word, after) => round(at(id) + wordAt(id, word, after));
export const T = {
  takes: placed,
  lines,
  // The hook: the finished trade, held, then rewound on "Let me take you back".
  hook: 0,
  rewind: w(0, "Let me"),
  // Scene starts: the cut sits a little before the take it opens.
  context: round(at(1) - 0.35),
  panesCvd: w(3, "Futures"),
  panesSpot: w(3, "But spot"),
  warning: w(4, "That's a"),
  brk: round(at(5) - 0.5),
  hits: w(5, "Boom"),
  valueArea: w(5, "We drop"),
  plan: round(at(6) - 0.5),
  val: w(6, "value area"),
  retest: w(6, "If price"),
  stop: w(7, "Stop goes"),
  target: w(7, "Target"),
  wait: round(at(8) - 0.5),
  candles: ["One", "Two", "Three", "Four"].map((x) => w(8, x)),
  none: w(8, "Nothing"),
  cvdLow: w(8, "And"),
  entry: round(at(9) - 0.5),
  touch: w(9, "Price tags"),
  short: round(at(9) + placed[9].split + SHORT_PAUSE),
  result: round(at(10) - 0.4),
  reaches: w(10, "we hit"),
  claim: round(at(11) - 0.4),
  claims: [w(11, "divergence") - 0.15, w(11, "break") - 0.15, w(11, "retest") - 0.15].map(round),
  end: round(t + 0.7),
};
T.duration = round(T.end + END_CARD);

function round(v) {
  return Math.round(v * 100) / 100;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  writeFileSync(join(VO, "timeline.json"), JSON.stringify(T, null, 1));
  const { takes: _, lines: l, ...beats } = T;
  console.log(JSON.stringify(beats));
  for (const x of l) console.log(`${x.at.toFixed(2)}–${x.until.toFixed(2)}  ${x.zh}`);
}
