// Builds .tape/case.data.json, the lab replay data for 11/05 (Taipei), from the platform's own
// 全市場 records: the day files the lab served live (GET /api/orderflow/btcusdt/day?ex=all&d=…,
// saved as .tape/api-all-<day>.json), which is what the owner was looking at when trading.
// History is the minute footprints from 11/04 08:00 Taipei; the replay then plays one slice per
// minute from 16:00 to 23:30 (the platform keeps minutes, not seconds; the film's chart is 15m).
// Prints (≥ 2 BTC, merged per taker order), OI, spot taker flow and liquidations come along.
// Run from this folder: node scripts/build-case.mjs
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { TAPE } from "./rig.mjs";

export const HISTORY = Date.parse("2026-11-04T08:00:00+08:00");
export const START = Date.parse("2026-11-05T16:00:00+08:00");
export const END = Date.parse("2026-11-05T23:30:00+08:00");

const days = ["2026-11-04", "2026-11-05"].map((d) => JSON.parse(readFileSync(join(TAPE, `api-all-${d}.json`), "utf8")));
const all = (key) => days.flatMap((d) => d[key] ?? []).sort((a, b) => a[0] - b[0]);
const tick = days[0].tick;
const bars = all("bars");
const rows = bars.filter((r) => r[0] >= HISTORY && r[0] < START);
const slices = bars.filter((r) => r[0] >= START && r[0] < END).map(([t, o, h, l, c, levels]) => [(t - START) / 1000, o, h, l, c, levels]);
const prints = all("prints").filter((p) => p[0] >= HISTORY && p[0] < END);
const metrics = all("metrics").filter((m) => m[0] >= HISTORY && m[0] <= END);
const spot = all("spot").filter((r) => r[0] >= HISTORY && r[0] < END);
const liquidations = all("liquidations").filter((r) => r[0] >= HISTORY && r[0] < END);

const out = { id: "2026-11-05", symbol: "BTCUSDT", source: "全市場", tick, history: HISTORY, start: START, end: END, rows, slices, prints, metrics, spot, liquidations };
mkdirSync(TAPE, { recursive: true });
writeFileSync(join(TAPE, "case.data.json"), JSON.stringify(out));
console.log(`tick ${tick}: ${rows.length} history minutes, ${slices.length} replay minutes, ${prints.length} prints, ${metrics.length} readings, ${spot.length} spot minutes, ${liquidations.length} liquidations, ${(JSON.stringify(out).length / 1e6).toFixed(1)} MB`);
