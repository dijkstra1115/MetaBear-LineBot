// Backtests key-level alerts on Bybit's daily trade archives, with the definitions and pass
// criteria pre-registered in docs/ORDERFLOW-KEYLEVEL-ALERTS.md (section 5a). Change them there
// first, and only together with data that has not been looked at.
//
//   npm run lab:orderflow:keylevels
//   npm run lab:orderflow:keylevels -- --from 2026-07-01 --to 2026-09-30 --eval 2026-07-03 --split 2026-08-17
//
// Archives are read from the cache of `npm run lab:orderflow:bybit` (.data/orderflow/bybit/) and
// downloaded when missing; the 1-minute rows built from them are cached in .data/orderflow/bybit-rows/.
// OI comes from Bybit's REST history, cached in .data/orderflow/bybit-oi.json.
import { createReadStream } from "node:fs";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import { createGunzip } from "node:zlib";
import { ArchiveDay, REST_URL, SYMBOL, TICK, archiveUrl } from "../public/lab/orderflow/bybit.js";
// Pre-registered on Taiwan days (docs/ORDERFLOW-KEYLEVEL-ALERTS.md §5a), so it keeps them although alerts
// now use UTC days.
import { LEVEL_DEFAULTS, LevelBook, MINUTE_MS, SESSION_MS, TAIPEI_OFFSET_MS, sessionOf, sessionStart } from "../public/lab/orderflow/keylevels.js";
import { aggregate, detect } from "../public/lab/orderflow/signals.js";
import { ALERT_DEFAULTS, OiWatch } from "../public/lab/orderflow/watch.js";

const args = Object.fromEntries(process.argv.slice(2).flatMap((x, i, all) => (x.startsWith("--") ? [[x.slice(2), all[i + 1]]] : [])));
const FROM = args.from ?? "2026-07-01"; // UTC archive days
const TO = args.to ?? "2026-09-30";
const EVAL = args.eval ?? "2026-07-03"; // Taiwan days
const SPLIT = args.split ?? "2026-08-17";

// Pre-registered (section 5a).
const TOL_PCT = 0.1;
const COOLDOWN_MS = 60 * MINUTE_MS;
const MOVE = 0.002;
const MOVE_ALT = 0.004;
const HORIZON_MIN = 60;
const APPROACH_MS = 30 * MINUTE_MS;
const SPIKE = { z: 3, window: 240, gapMs: 10 * MINUTE_MS };
const PRIMARY = "deltaSpikeAbsorbed";
const PASS = { minDecided: 30, primarySe: 2, otherSe: 3, maxPerDay: 3 };

const root = fileURLToPath(new URL("..", import.meta.url));
const cache = `${root}.data/orderflow/`;
const DAY = 86_400_000;
const days = [];
for (let t = Date.parse(`${FROM}T00:00:00Z`); t <= Date.parse(`${TO}T00:00:00Z`); t += DAY) days.push(new Date(t).toISOString().slice(0, 10));

async function exists(file) {
  try {
    return (await stat(file)).size > 0;
  } catch {
    return false;
  }
}

async function dayRows(day) {
  const out = `${cache}bybit-rows/${day}.json`;
  if (await exists(out)) return JSON.parse(await readFile(out, "utf8"));
  const gz = `${cache}bybit/${SYMBOL}${day}.csv.gz`;
  if (!(await exists(gz))) {
    const res = await fetch(archiveUrl(day));
    if (!res.ok) throw new Error(`${day}: HTTP ${res.status}`);
    await writeFile(gz, Buffer.from(await res.arrayBuffer()));
  }
  const build = new ArchiveDay();
  for await (const line of createInterface({ input: createReadStream(gz).pipe(createGunzip()), crlfDelay: Infinity })) build.add(line);
  const { rows, prints } = build.take();
  const data = { rows, prints: prints.filter((p) => p[3] >= ALERT_DEFAULTS.printBtc) };
  await writeFile(out, JSON.stringify(data));
  return data;
}

// 5-minute OI readings [t, oi] in reading time.
async function oiHistory(from, to) {
  const file = `${cache}bybit-oi.json`;
  let have = (await exists(file)) ? JSON.parse(await readFile(file, "utf8")) : [];
  if (!have.length || have[0][0] > from + 5 * MINUTE_MS || have.at(-1)[0] < to - 10 * MINUTE_MS) {
    const byT = new Map(have.map((r) => [r[0], r]));
    for (let start = from; start < to; start += 200 * 5 * MINUTE_MS) {
      const end = Math.min(to, start + 200 * 5 * MINUTE_MS - 1);
      const res = await fetch(`${REST_URL}/v5/market/open-interest?category=linear&symbol=${SYMBOL}&intervalTime=5min&limit=200&startTime=${start}&endTime=${end}`);
      const body = await res.json();
      if (body.retCode !== 0) throw new Error(`OI ${body.retCode} ${body.retMsg}`);
      for (const r of body.result.list) byT.set(Number(r.timestamp), [Number(r.timestamp), Number(r.openInterest)]);
    }
    have = [...byT.values()].sort((a, b) => a[0] - b[0]);
    await writeFile(file, JSON.stringify(have));
  }
  return have.filter((r) => r[0] >= from && r[0] < to);
}

await mkdir(`${cache}bybit/`, { recursive: true });
await mkdir(`${cache}bybit-rows/`, { recursive: true });
const rows = [];
const prints = [];
for (const day of days) {
  const d = await dayRows(day);
  rows.push(...d.rows);
  prints.push(...d.prints);
  process.stderr.write(`${day} `);
}
process.stderr.write("\n");
rows.sort((a, b) => a[0] - b[0]);
const first = rows[0][0];
const last = rows.at(-1)[0] + MINUTE_MS;
const readings = await oiHistory(first, last);
const idx = new Map(rows.map((r, i) => [r[0], i]));
const rowAt = (t) => rows[idx.get(t)];
const minuteOf = (t) => Math.floor(t / MINUTE_MS) * MINUTE_MS;
const closeBefore = (t) => rowAt(minuteOf(t) - MINUTE_MS)?.[4] ?? null; // close of the minute ending at or before t

const evalStart = sessionStart(sessionOf(Date.parse(`${EVAL}T12:00:00+08:00`), TAIPEI_OFFSET_MS), TAIPEI_OFFSET_MS);
const splitAt = sessionStart(sessionOf(Date.parse(`${SPLIT}T12:00:00+08:00`), TAIPEI_OFFSET_MS), TAIPEI_OFFSET_MS);
const evalEnd = sessionStart(sessionOf(Date.parse(`${TO}T12:00:00+08:00`), TAIPEI_OFFSET_MS) + 1, TAIPEI_OFFSET_MS); // end of the last Taiwan day…
const lastEval = Math.min(evalEnd, last - (HORIZON_MIN + 2) * MINUTE_MS); // …that still has a full horizon of data
const halves = { train: [evalStart, splitAt], validation: [splitAt, lastEval] };
const halfDays = Object.fromEntries(Object.entries(halves).map(([k, [a, b]]) => [k, (b - a) / SESSION_MS]));

// ---------- events ----------
const events = [];
const bars5 = aggregate(rows, TICK, readings);
for (const e of detect(bars5, ["absorption", "sweep", "divergence", "stackedRetest"])) events.push({ kind: e.kind, t: e.t, price: e.price, dir: e.dir });
{
  const deltas = rows.map((r) => r[5].reduce((a, [, b, s]) => a + b - s, 0));
  let sum = 0;
  let sq = 0;
  let lastSpike = -Infinity;
  for (let i = 0; i < rows.length; i++) {
    if (i >= SPIKE.window) {
      const n = SPIKE.window;
      const mean = sum / n;
      const sd = Math.sqrt(Math.max(0, sq / n - mean * mean)) || 1;
      const z = (deltas[i] - mean) / sd;
      const [t, , h, l, c] = rows[i];
      if (Math.abs(z) >= SPIKE.z && t - lastSpike >= SPIKE.gapMs) {
        const mid = (h + l) / 2;
        const absorbed = z > 0 ? c <= mid : c >= mid;
        events.push({ kind: absorbed ? "deltaSpikeAbsorbed" : "deltaSpike", t: t + MINUTE_MS, price: z > 0 ? h : l, dir: absorbed ? (z > 0 ? "down" : "up") : null });
        lastSpike = t;
      }
      sum -= deltas[i - n];
      sq -= deltas[i - n] ** 2;
    }
    sum += deltas[i];
    sq += deltas[i] ** 2;
  }
}
for (const [t, , price] of prints) events.push({ kind: "print", t, price, dir: null });
{
  const w = new OiWatch({ ...ALERT_DEFAULTS });
  for (const [t, oi] of readings) {
    const price = closeBefore(t);
    if (price != null && w.add(t, oi, price)) events.push({ kind: "oi", t, price, dir: null });
  }
}
events.sort((a, b) => a.t - b.t);

// ---------- replay: levels as of each event, then the outcome ----------
function race(entryMinute, dir, move) {
  const entry = rowAt(entryMinute)?.[4];
  if (entry == null) return null;
  const x = entry * move;
  for (let k = 1; k <= HORIZON_MIN; k++) {
    const r = rowAt(entryMinute + k * MINUTE_MS);
    if (!r) return null;
    const fav = dir === "up" ? r[2] >= entry + x : r[3] <= entry - x;
    const adv = dir === "up" ? r[3] <= entry - x : r[2] >= entry + x;
    if (adv) return 0; // both in one minute counts as a miss
    if (fav) return 1;
  }
  return 0.5; // undecided
}

const book = new LevelBook(TICK, { ...LEVEL_DEFAULTS, sessionOffsetMs: TAIPEI_OFFSET_MS });
const kept = []; // { kind, t, level, dir, r, r2 }
const lastKey = new Map();
const keep = (kind, t, level, dir, entryMinute) => {
  if (t < evalStart || t >= lastEval) return;
  const key = `${kind}|${level}|${dir}`;
  if (t - (lastKey.get(key) ?? -Infinity) < COOLDOWN_MS) return;
  lastKey.set(key, t);
  kept.push({ kind, t, level, dir, r: race(entryMinute, dir, MOVE), r2: race(entryMinute, dir, MOVE_ALT) });
};
let e = 0;
for (let i = 0; i < rows.length; i++) {
  const row = rows[i];
  const m = row[0];
  // Events in this minute (or at its start) see the book as of the minutes before it.
  for (; e < events.length && minuteOf(events[e].t) <= m; e++) {
    const ev = events[e];
    if (minuteOf(ev.t) < m) continue;
    const L = book.near(ev.t, ev.price, TOL_PCT);
    if (!L) continue;
    let dir = ev.dir;
    if (!dir) {
      const before = closeBefore(ev.t - APPROACH_MS);
      if (before == null) continue;
      dir = before < ev.price ? "down" : "up";
    }
    keep(ev.kind, ev.t, L.name, dir, m);
  }
  // Baseline: this minute's range reaching a level.
  const before = rows[i - APPROACH_MS / MINUTE_MS]?.[4];
  if (before != null)
    for (const L of book.levels(m)) {
      const tol = (row[4] * TOL_PCT) / 100;
      if (row[3] - L.price > tol || L.price - row[2] > tol) continue;
      keep("touch", m + MINUTE_MS - 1, L.name, before < L.price ? "down" : "up", m);
    }
  book.addMinute(row);
}

// ---------- report ----------
function stats(list, field = "r") {
  const res = list.map((x) => x[field]).filter((r) => r != null);
  const decided = res.filter((r) => r !== 0.5);
  const hit = decided.length ? decided.filter((r) => r === 1).length / decided.length : NaN;
  return { n: list.length, decided: decided.length, undecided: res.length - decided.length, hit, se: Math.sqrt((hit * (1 - hit)) / Math.max(1, decided.length)) };
}
const pct = (x) => (Number.isFinite(x) ? `${(x * 100).toFixed(0)}%` : "–");
const inHalf = (h) => (x) => x.t >= halves[h][0] && x.t < halves[h][1];
const KINDS = ["touch", PRIMARY, "deltaSpike", "absorption", "sweep", "stackedRetest", "divergence", "print", "oi"];
const report = { from: FROM, to: TO, eval: EVAL, split: SPLIT, halfDays, kinds: {}, levels: {} };
const base = Object.fromEntries(Object.keys(halves).map((h) => [h, stats(kept.filter((x) => x.kind === "touch" && inHalf(h)(x)))]));

console.log(`Bybit ${SYMBOL} ${FROM}..${TO} (UTC files), Taiwan days ${EVAL}.. ; train ${halfDays.train.toFixed(1)} d, validation ${halfDays.validation.toFixed(1)} d`);
console.log(`hit = ${MOVE * 100}% before -${MOVE * 100}% within ${HORIZON_MIN} min; levels within ${TOL_PCT}%`);
console.log("kind                 | train /day  hit (±SE)  n | valid /day  hit (±SE)  n  undec | valid 0.4% | pass");
for (const kind of KINDS) {
  const row = {};
  for (const h of Object.keys(halves)) {
    const list = kept.filter((x) => x.kind === kind && inHalf(h)(x));
    row[h] = { perDay: list.length / halfDays[h], ...stats(list), alt: stats(list, "r2") };
  }
  const v = row.validation;
  const tr = row.train;
  const k = kind === PRIMARY ? PASS.primarySe : PASS.otherSe;
  row.pass =
    kind === "touch"
      ? null
      : v.decided >= PASS.minDecided && v.hit - base.validation.hit >= k * v.se && tr.hit > base.train.hit && v.perDay <= PASS.maxPerDay;
  report.kinds[kind] = row;
  const cell = (s) => `${s.perDay.toFixed(1).padStart(5)}  ${pct(s.hit).padStart(4)} (±${pct(s.se)}) ${String(s.decided).padStart(4)}`;
  console.log(`${kind.padEnd(20)} | ${cell(tr)} | ${cell(v)} ${pct(v.undecided / Math.max(1, v.n)).padStart(4)} | ${pct(v.alt.hit).padStart(5)}     | ${row.pass == null ? "base" : row.pass ? "PASS" : "fail"}`);
}
console.log("\nvalidation, all event kinds by level:");
for (const L of ["pdh", "pdl", "poc", "vah", "val", "vwap", "stack"]) {
  const list = kept.filter((x) => x.kind !== "touch" && x.level === L && inHalf("validation")(x));
  const b = stats(kept.filter((x) => x.kind === "touch" && x.level === L && inHalf("validation")(x)));
  const s = stats(list);
  report.levels[L] = { events: s, touch: b };
  console.log(`  ${L.padEnd(6)} events ${(list.length / halfDays.validation).toFixed(1).padStart(5)}/day ${pct(s.hit).padStart(4)} (±${pct(s.se)}) n ${s.decided} | touch ${pct(b.hit)} n ${b.decided}`);
}
await writeFile(`${cache}keylevel-backtest.json`, JSON.stringify(report, null, 1));
console.log(`\nwritten ${cache}keylevel-backtest.json`);
