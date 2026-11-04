// Step 1 of the strategy research: every signal of strategies A–E and of the three case-wall rules
// over the whole archive, plus compact 1-minute OHLC for the other scripts.
//
//   node --max-old-space-size=14000 scripts/strategy-research/export.mjs
//
// Needs .data/orderflow/btcusdt-{oos,90d,oct}.json (scripts/orderflow-data.mjs). Writes
// .data/orderflow/research/{ae-signals,case-rule-signals,ohlc}.json.
import { mkdirSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fromArchive } from "../../public/lab/orderflow/metrics.js";
import { dayProfiles, findFailedAuctions } from "../../public/lab/orderflow/strategy-failed-auction.js";
import { context, findB, findC, findD, findE } from "../replay-cases/strategies.mjs";
import { OUT, ROOT, loadArchives } from "./lib.mjs";

mkdirSync(OUT, { recursive: true });
const { rows, metrics, tick } = loadArchives();
const readings = fromArchive(metrics).sort((a, b) => a[0] - b[0]);
console.log(`${rows.length} rows, ${new Date(rows[0][0]).toISOString().slice(0, 10)} → ${new Date(rows.at(-1)[0]).toISOString().slice(0, 10)}`);

const ctx = context(rows, tick, readings);
const out = [];
for (const c of findFailedAuctions(rows, tick, readings)) {
  if (c.plan) out.push({ strat: "A", dir: c.dir, entryT: c.plan.entryT, entry: c.plan.entry, stop: c.plan.stop, tp: c.plan.t1, what: `${c.dir === "long" ? "前日低" : "前日高"} ${Math.round(c.level)}` });
}
const NAME = { C: "推升後回檔", D: "爆倉插針反做", E: "開盤區間突破回測" };
for (const t of [...findB(ctx, dayProfiles(rows, tick)), ...findC(ctx), ...findD(ctx), ...findE(ctx)]) {
  const what = t.strat === "B" ? `${t.kind === "flip" ? "翻轉" : "守住"} ${t.level} ${Math.round(t.levelPrice)}` : NAME[t.strat];
  out.push({ strat: t.strat, kind: t.kind, dir: t.dir, entryT: t.entryT, entry: t.entry, stop: t.stop, tp: t.tp, fill: !!t.fillMinute, what });
}
writeFileSync(`${OUT}ae-signals.json`, JSON.stringify(out));
console.log(`ae-signals.json: ${["A", "B", "C", "D", "E"].map((s) => `${s} ${out.filter((x) => x.strat === s).length}`).join(", ")}`);
writeFileSync(`${OUT}ohlc.json`, JSON.stringify(rows.map((r) => r.slice(0, 5))));

// The case-wall rules keep their own scanner; --out leaves the segment films' input alone.
execFileSync(process.execPath, ["--max-old-space-size=8192", `${ROOT}scripts/replay-cases/scan-case-rules.mjs`, "--case", "9", "--json", "--out", `${OUT}case-rule-signals.json`], { stdio: ["ignore", "ignore", "inherit"] });
console.log("case-rule-signals.json written");
