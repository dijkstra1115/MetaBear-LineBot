// Searches the archive datasets for real cases of strategy 01 (failed auction) and lists the
// winning ones as film candidates. Internal research only: the counts are not for publishing.
//
//   npm run lab:strategy:cases
//   npm run lab:strategy:cases -- --data .data/orderflow/btcusdt-90d.json
//   npm run lab:strategy:cases -- --preset loose          # LOOSE thresholds, more trades
//
// Writes .data/orderflow/cases-failed-auction.json.
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { LOOSE, findFailedAuctions } from "../public/lab/orderflow/strategy-failed-auction.js";

const args = Object.fromEntries(process.argv.slice(2).flatMap((x, i, all) => (x.startsWith("--") ? [[x.slice(2), all[i + 1]]] : [])));
const root = fileURLToPath(new URL("..", import.meta.url));
const files = args.data ? [args.data] : [".data/orderflow/btcusdt-oos.json", ".data/orderflow/btcusdt-90d.json"];

const all = [];
for (const file of files) {
  const raw = JSON.parse(await readFile(`${root}${file}`, "utf8"));
  const found = findFailedAuctions(raw.bars, raw.tick, raw.metrics, { params: args.preset === "loose" ? LOOSE : {} });
  console.log(`${file}: ${raw.from} → ${raw.to}, ${found.length} breaks of a prior-day extreme that reclaimed value`);
  all.push(...found);
}

const tpe = (ms) => new Date(ms + 8 * 3600_000).toISOString().slice(0, 16).replace("T", " ");
const count = (f) => all.filter(f).length;
console.log(`\nfunnel (internal, ${args.preset ?? "strict"}):`);
for (const dir of ["long", "short"]) {
  const d = (f) => count((c) => c.dir === dir && f(c));
  console.log(
    `  ${dir === "long" ? "多方（課程）" : "空方（鏡像）"}: reclaimed ${d(() => true)}, OI+absorb ${d((c) => c.checks.oi && c.checks.absorb)}, ` +
      `entered ${d((c) => c.plan && c.sim)}, stop ${d((c) => c.outcome === "stop")}, T1 ${d((c) => c.outcome === "t1")}, T2 ${d((c) => c.outcome === "t2")}, timeout ${d((c) => c.outcome === "timeout")}, ` +
      `void ${d((c) => c.outcome === "void")}, same trade ${d((c) => c.outcome === "in-trade")}, no re-test ${d((c) => c.outcome === "no-retest")}, small reward ${d((c) => c.outcome === "reward-too-small")}`,
  );
}

// Film candidates: winners, best teaching value first (all four checks, reached T2, fast, clear).
const winners = all
  .filter((c) => c.outcome === "t2" || c.outcome === "t1")
  .map((c) => ({
    ...c,
    score: (c.checks.divergence ? 2 : 0) + (c.outcome === "t2" ? 2 : 0) + (c.dir === "long" ? 1 : 0) + Math.min(2, c.r) - ((c.sim.exitT - c.sweepT) / 3600_000) * 0.05,
  }))
  .sort((a, b) => b.score - a.score);
console.log(`\nwinning cases (${winners.length}), best teaching value first; times in Taipei:`);
for (const c of winners.slice(0, 20)) {
  const p = c.plan;
  console.log(
    `  ${c.dir === "long" ? "多" : "空"} ${tpe(c.sweepT)}  前日${c.dir === "long" ? "低" : "高"} ${Math.round(c.level)} → 掃到 ${Math.round(c.extreme)}  ` +
      `OI ${(c.oi.change * 100).toFixed(2)}%  吸收 ${c.absorb.aggressor}/${c.absorb.passive}  ${c.checks.divergence ? "背離✓" : "背離—"}  ` +
      `進 ${Math.round(p.entry)} (${tpe(p.entryT)}, ${c.entrySignal})  損 ${Math.round(p.stop)}  T1 ${Math.round(p.t1)} (${p.r1.toFixed(1)}R)  T2 ${Math.round(p.t2)} (${p.r2.toFixed(1)}R)  ` +
      `→ ${c.outcome.toUpperCase()} ${tpe(c.sim.exitT)}`,
  );
}
await writeFile(`${root}.data/orderflow/cases-failed-auction${args.preset ? "-" + args.preset : ""}.json`, JSON.stringify(all, null, 1));
