// Replays the FLOW ARENA scores stored before the server replayed every upload (verified = 0) and
// stores each replay's result as verified, the same as an upload now gets (src/arena-scores.ts).
// Only scores of the current engine version are replayed. The report lists every score whose
// result changes and every one that does not replay; nothing is written without --apply.
//
//   npm run arena:verify                          production database, report only
//   npm run arena:verify -- --apply               write the replayed results
//   npm run arena:verify -- --env staging         preview.metabear.io's database
//   npm run arena:verify -- --local --persist-to <dir>   a local copy, for trying it out
//
// Remote databases need `npx wrangler login`. Safe to run again: it reads only scores still at
// verified = 0, and every update requires verified = 0 too.
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { RANKED_VERSION, replayRanked } from "../public/arena/engine/ranked.js";
import { pickStats } from "../src/arena-scores";

type Row = { id: number; name: string; pnl: number; seed: number; turns: number; stats: string; actions: string };
type Checked = { id: number; name: string; stored: number; pnl: number; stats: Record<string, unknown> };

const PAGE = 20; // action logs run up to a few hundred KB each

/** Sorts stored scores by what their replay gives: the same result, another result, or none. */
export function verifyScores(rows: Row[], replay: typeof replayRanked = replayRanked) {
  const matched: Checked[] = [];
  const corrected: Checked[] = [];
  const failed: { id: number; name: string; stored: number; reason: string }[] = [];
  for (const row of rows) {
    try {
      const result = replay({ seed: row.seed, actions: JSON.parse(row.actions), turns: row.turns });
      // A legacy score an admin recalculated keeps its source, so the board still labels it.
      const source = (JSON.parse(row.stats) as { recalculatedFrom?: unknown }).recalculatedFrom;
      const stats = { ...pickStats(result), ...(source == null ? {} : { recalculatedFrom: source }) };
      (result.pnl === row.pnl ? matched : corrected).push({ id: row.id, name: row.name, stored: row.pnl, pnl: result.pnl, stats });
    } catch (error) {
      failed.push({ id: row.id, name: row.name, stored: row.pnl, reason: error instanceof Error ? error.message : String(error) });
    }
  }
  return { matched, corrected, failed };
}

const sqlText = (value: string) => `'${value.replaceAll("'", "''")}'`;

/** One UPDATE per score; each applies only while the score is still unverified. */
export function updateSql(entries: Checked[]) {
  return entries
    .map((e) => {
      if (!Number.isSafeInteger(e.id) || !Number.isFinite(e.pnl)) throw new Error(`Score ${e.id} has no usable result`);
      return `UPDATE arena_scores SET pnl = ${e.pnl}, stats = ${sqlText(JSON.stringify(e.stats))}, verified = 1 WHERE id = ${e.id} AND verified = 0;`;
    })
    .join("\n");
}

const root = fileURLToPath(new URL("..", import.meta.url));

// Wrangler's own entry run by this Node, so no shell is involved on any platform.
function wrangler(target: string[], args: string[]) {
  return execFileSync(process.execPath, [join(root, "node_modules", "wrangler", "bin", "wrangler.js"), "d1", "execute", "ARENA_DB", ...target, ...args], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 256 * 1024 * 1024,
    stdio: ["ignore", "pipe", "inherit"],
  });
}

function query<T>(target: string[], sql: string): T[] {
  return (JSON.parse(wrangler(target, ["--json", "--command", sql])) as { results: T[] }[])[0].results;
}

function main() {
  const args = process.argv.slice(2);
  const option = (name: string) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);
  const env = option("--env") ?? "production";
  if (env !== "production" && env !== "staging") throw new Error("--env is production or staging");
  const persist = option("--persist-to");
  const target = ["--env", env, ...(args.includes("--local") ? ["--local", ...(persist ? ["--persist-to", persist] : [])] : ["--remote"])];

  const rows: Row[] = [];
  for (let after = 0; ; ) {
    const page = query<Row>(
      target,
      `SELECT id, name, pnl, seed, turns, stats, actions FROM arena_scores WHERE version = ${RANKED_VERSION} AND verified = 0 AND id > ${after} ORDER BY id LIMIT ${PAGE}`,
    );
    rows.push(...page);
    if (page.length < PAGE) break;
    after = page[page.length - 1].id;
  }
  console.log(`${env}${args.includes("--local") ? " (local)" : ""}: ${rows.length} unverified scores of engine version ${RANKED_VERSION}`);
  let done = 0;
  const report = verifyScores(rows, (input) => {
    process.stdout.write(`\rreplaying ${++done}/${rows.length}`);
    return replayRanked(input);
  });
  if (rows.length) process.stdout.write("\n");
  console.log(`same result: ${report.matched.length}, different result: ${report.corrected.length}, no result: ${report.failed.length}`);
  for (const c of report.corrected) console.log(`  #${c.id} ${c.name}: stored ${c.stored} -> replayed ${c.pnl}`);
  for (const f of report.failed) console.log(`  #${f.id} ${f.name}: stored ${f.stored}, not replayed (${f.reason}); left unverified`);

  const entries = [...report.matched, ...report.corrected];
  if (!args.includes("--apply")) return console.log(entries.length ? "Report only. Run again with --apply to write." : "Nothing to write.");
  // Mostly different results mean the engine changed after these games without a version bump.
  if (report.corrected.length > report.matched.length && !args.includes("--force")) {
    console.error("More scores change than match, so the engine has probably changed since they were played. Nothing written (--force writes anyway).");
    process.exitCode = 1;
    return;
  }
  if (!entries.length) return console.log("Nothing to write.");
  const dir = mkdtempSync(join(tmpdir(), "arena-verify-"));
  try {
    const file = join(dir, "verify.sql");
    writeFileSync(file, updateSql(entries));
    wrangler(target, ["--file", file]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  console.log(`Verified ${entries.length} scores, ${report.corrected.length} of them with the replayed result in place of the stored one.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
