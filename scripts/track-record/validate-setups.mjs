// Checks the setup checks against the trades whose opening logic is on record: for each label tag
// (data/track-record/setup-labels.json), how often the check finds it at the real entry, against
// how often it fires at random minutes of the same markets (the base rate). A check that fires
// everywhere says nothing about a trade, however often it "finds" the logic.
//
//   node scripts/track-record/validate-setups.mjs [--detail]
//
// Writes the totals to data/track-record/setup-validation.json, which the cards quote.
import { readFile, writeFile } from "node:fs/promises";
import { loadBars } from "./bars.mjs";
import { prepareSetups, setupsAt, tagsOf, MIN } from "./setups.mjs";

const HOUR = 60 * MIN;
const HISTORY = 12 * 24 * HOUR; // ATR(200) on 1h and the 50-bar swing structure need days of bars
const root = new URL("../../", import.meta.url);
const { cards } = JSON.parse(await readFile(new URL("public/track-record/cards.json", root), "utf8"));
const { labels } = JSON.parse(await readFile(new URL("data/track-record/setup-labels.json", root), "utf8"));
const TAGS = ["sweep", "eq", "ob", "obOverlap", "fvg", "absorb"]; // wick and deltaFade have no check
const SAMPLES = 40;

let seed = 7;
const rand = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);

const hit = Object.fromEntries(TAGS.map((t) => [t, { want: 0, got: 0, base: 0, baseN: 0, extra: 0 }]));
const rows = [];
for (const [id, label] of Object.entries(labels)) {
  if (label.skip || !label.tags.length) continue;
  const card = cards.find((c) => c.id === id);
  if (!card) throw new Error(`${id}: no card`);
  const m1 = await loadBars(card.symbol, card.source, card.openT - HISTORY, card.openT + MIN);
  // Base rate: random minutes 2–48 h before the entry, random side, same risk in %.
  const riskPct = Math.abs(card.entry - card.stop) / card.entry;
  const pool = m1.filter((b) => b.t >= card.openT - 48 * HOUR && b.t <= card.openT - 2 * HOUR);
  const samples = [];
  for (let s = 0; s < SAMPLES && pool.length; s++) {
    const b = pool[Math.floor(rand() * pool.length)];
    const side = rand() < 0.5 ? "long" : "short";
    samples.push({ side, entry: b.c, stop: side === "long" ? b.c * (1 - riskPct) : b.c * (1 + riskPct), at: b.t });
  }
  const prep = prepareSetups(m1, [card.openT, ...samples.map((s) => s.at)]);
  const found = setupsAt(prep, { side: card.side, entry: card.entry, stop: card.stop, at: card.openT });
  const tags = tagsOf(found);
  for (const t of TAGS) {
    if (label.tags.includes(t)) {
      hit[t].want++;
      if (tags.has(t)) hit[t].got++;
    } else if (tags.has(t)) hit[t].extra++;
  }
  for (const s of samples) {
    const t2 = tagsOf(setupsAt(prep, s));
    for (const t of TAGS) {
      hit[t].baseN++;
      if (t2.has(t)) hit[t].base++;
    }
  }
  const want = label.tags;
  const got = want.filter((t) => tags.has(t));
  const days = m1.length ? ((card.openT - m1[0].t) / 24 / HOUR).toFixed(1) : "0";
  rows.push({ id, src: card.source, days, want, got, more: [...tags].filter((t) => !want.includes(t)), found });
}

const pct = (a, b) => (b ? `${Math.round((100 * a) / b)}%` : "-");
console.log("tag         labelled  found  recall  base rate  fires w/o label");
for (const t of TAGS) {
  const h = hit[t];
  console.log(`${t.padEnd(11)} ${String(h.want).padStart(8)} ${String(h.got).padStart(6)} ${pct(h.got, h.want).padStart(7)} ${pct(h.base, h.baseN).padStart(10)} ${String(h.extra).padStart(16)}`);
}
console.log();
for (const r of rows) {
  const miss = r.want.filter((t) => !r.got.includes(t));
  console.log(`${r.id.padEnd(24)} ${r.src.padEnd(7)} ${r.days.padStart(4)}d ${r.got.length}/${r.want.length}  found [${r.got}]${miss.length ? `  missed [${miss}]` : ""}${r.more.length ? `  also [${r.more}]` : ""}`);
}
const totals = Object.fromEntries(TAGS.map((t) => [t, { labelled: hit[t].want, found: hit[t].got, baseRate: Math.round((1000 * hit[t].base) / hit[t].baseN) / 1000 }]));
await writeFile(new URL("data/track-record/setup-validation.json", root), JSON.stringify({ trades: rows.length, samplesPerTrade: SAMPLES, totals }, null, 2) + "\n");
if (process.argv.includes("--detail")) for (const r of rows) console.log(r.id, JSON.stringify(r.found));
