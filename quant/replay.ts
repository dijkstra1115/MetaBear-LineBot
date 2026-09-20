import { resolve } from "node:path";
import { writeFileSync, existsSync } from "node:fs";
import { QuantStore } from "./store.js";
import { initialState, step } from "./engine.js";
import type { Fill, Decision } from "./types.js";

const path = process.argv[2];
if (!path)
  throw Error(
    "Usage: npm run quant:replay -- quant/.data/live.sqlite [report.json]",
  );
if (!existsSync(resolve(path))) throw Error("找不到已記錄的資料檔");
const store = new QuantStore(resolve(path));
// Hold one WAL read snapshot even while the collector continues writing.
store.db.exec("BEGIN");
let state = initialState(store.config),
  count = 0;
const fills: Fill[] = [],
  decisions: Decision[] = [];
for (const frame of store.exportFrames()) {
  const result = step(state, frame, store.config);
  state = result.state;
  count++;
  fills.push(...result.fills);
  if (result.decision) decisions.push(result.decision);
}
const same = JSON.stringify(state) === JSON.stringify(store.state());
store.db.exec("COMMIT");
const report = {
  mode: "recorded-paper-replay",
  frames: count,
  exactStateMatch: same,
  config: store.config,
  state,
  fills,
  decisions,
  limitation:
    "回放已收集的十秒觀測點，不代表重建期間每一筆成交；沒有未收集期間的訂單流。",
};
if (process.argv[3])
  writeFileSync(resolve(process.argv[3]), JSON.stringify(report, null, 2));
console.log(
  JSON.stringify(
    {
      frames: count,
      exactStateMatch: same,
      completed: state.completed,
      cash: state.cash,
      maxDrawdownPct: state.maxDrawdownPct,
    },
    null,
    2,
  ),
);
store.close();
if (!same) process.exitCode = 1;
