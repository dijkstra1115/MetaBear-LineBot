import { resolve } from "node:path";
import { readdirSync, writeFileSync } from "node:fs";
import { readRecording } from "./recording.js";
import { verifyRecording } from "./recording-state.js";

const directory = process.argv[2];
if (!directory)
  throw Error(
    "Usage: npm run quant:raw:replay -- <session-directory> [report.json]",
  );
const report = {
  directory: resolve(directory),
  ...verifyRecording(readRecording(resolve(directory))),
  unfinishedSegments: readdirSync(directory).filter((name) =>
    name.endsWith(".json.gz.tmp"),
  ).length,
};
console.log(JSON.stringify(report, null, 2));
if (process.argv[3])
  writeFileSync(
    resolve(process.argv[3]),
    JSON.stringify(report, null, 2) + "\n",
  );
if (
  !report.cleanShutdown ||
  !report.replayVerified ||
  report.unfinishedSegments
)
  process.exitCode = 2;
