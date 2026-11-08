import {
  MAX_ACTIONS,
  RANKED_TURNS,
  RANKED_VERSION,
  SETTLED_SEASON_VERSION,
  checkActions,
  replayRanked,
} from "../public/arena/engine/ranked.js";
import { HttpError, json, readBody } from "./http";

// FLOW ARENA ranked leaderboard. The engine is deterministic, so every upload is replayed from its
// seed and action log (1.5 to 2.5 s of CPU, within the Workers paid plan's 30 s) and the replayed
// result is what gets stored and ranked, marked verified; the pnl a page claims is never trusted.
// verified: 1 replayed here, 0 uploaded before replays (still ranked), -1 not replayed (never ranked).
export interface ArenaEnv {
  ARENA_DB?: D1Database;
  /** Optional secret that keys the hash of the uploader's address (hashClient). */
  ARENA_IP_KEY?: string;
}

const NAME_MAX = 18;
const PNL_LIMIT = 1e11; // a hundred billion USDT is not a game result
const HOURLY_UPLOADS = 20;
const BOARD_SIZE = 50;
const BODY_LIMIT = 400_000;

type ScoreRow = {
  id: number;
  name: string;
  pnl: number;
  seed: number;
  turns: number;
  verified: number;
  created_at: string;
  source_score_id: number | null;
};

export async function handleArenaScores(
  request: Request,
  env: ArenaEnv,
  replay: typeof replayRanked = replayRanked,
): Promise<Response> {
  const db = env.ARENA_DB;
  if (!db) return json({ error: "排行榜尚未啟用" }, 503);
  try {
    if (request.method === "GET" || request.method === "HEAD") {
      const season = new URL(request.url).searchParams.get("season") ?? "current";
      if (season !== "current" && season !== "legacy") throw new HttpError(400, "未知的賽季");
      return json({ season, scores: await topScores(db, season) });
    }
    if (request.method !== "POST") return json({ error: "不支援的方法" }, 405);
    if (!request.headers.get("Content-Type")?.includes("application/json"))
      throw new HttpError(415, "需要 JSON");
    const score = parseScore(await readBody(request, BODY_LIMIT));
    const ipHash = await hashClient(request, env.ARENA_IP_KEY);
    const recent = await db
      .prepare(
        "SELECT COUNT(*) AS n FROM arena_scores WHERE ip_hash = ? AND created_at > datetime('now', '-1 hour')",
      )
      .bind(ipHash)
      .first<{ n: number }>();
    if ((recent?.n ?? 0) >= HOURLY_UPLOADS)
      throw new HttpError(429, "上傳太頻繁，請稍後再試");
    // Hashes only have to count the last hour's uploads, and refused uploads are kept only for that.
    await db.batch([
      db.prepare("DELETE FROM arena_scores WHERE verified < 0 AND created_at <= datetime('now', '-1 hour')"),
      db.prepare("UPDATE arena_scores SET ip_hash = '' WHERE ip_hash <> '' AND created_at <= datetime('now', '-1 hour')"),
    ]);
    // Stored unranked (verified -1) before the replay, so one that fails or runs out of CPU still
    // counts toward the hourly limit.
    const inserted = await db
      .prepare(
        "INSERT INTO arena_scores (name, pnl, seed, turns, version, stats, actions, ip_hash, verified) VALUES (?, 0, ?, ?, ?, '{}', ?, ?, -1) RETURNING id",
      )
      .bind(score.name, score.seed, score.turns, score.version, JSON.stringify(score.actions), ipHash)
      .first<{ id: number }>();
    if (!inserted) throw new Error("Score insert returned no id");
    const result = replayScore(score, replay);
    await db
      .prepare("UPDATE arena_scores SET pnl = ?, stats = ?, verified = 1 WHERE id = ?")
      .bind(result.pnl, JSON.stringify(result.stats), inserted.id)
      .run();
    const better = await db
      .prepare("SELECT COUNT(*) AS n FROM arena_scores WHERE version >= ? AND verified >= 0 AND pnl > ?")
      .bind(SETTLED_SEASON_VERSION, result.pnl)
      .first<{ n: number }>();
    return json({ id: inserted.id, rank: (better?.n ?? 0) + 1, season: "current" }, 201);
  } catch (error) {
    if (error instanceof HttpError) return json({ error: error.message }, error.status);
    throw error;
  }
}

async function topScores(db: D1Database, season: "current" | "legacy") {
  const { results } = await db
    .prepare(
      `SELECT id, name, pnl, seed, turns, verified, created_at, json_extract(stats, '$.recalculatedFrom') AS source_score_id FROM arena_scores WHERE version ${season === "legacy" ? "<" : ">="} ? AND verified >= 0 ORDER BY pnl DESC, id ASC LIMIT ?`,
    )
    .bind(SETTLED_SEASON_VERSION, BOARD_SIZE)
    .all<ScoreRow>();
  return results.map((row) => ({
    id: row.id,
    name: row.name,
    pnl: row.pnl,
    seed: row.seed,
    turns: row.turns,
    verified: Boolean(row.verified),
    recalculatedFrom: row.source_score_id ?? null,
    createdAt: `${row.created_at.replace(" ", "T")}Z`,
  }));
}

export function parseScore(text: string) {
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(text);
  } catch {
    throw new HttpError(400, "資料不是有效的 JSON");
  }
  if (!body || typeof body !== "object") throw new HttpError(400, "資料格式不對");
  if (body.version !== RANKED_VERSION) throw new HttpError(400, "遊戲版本不符，請重新整理後再玩");
  if (body.turns !== RANKED_TURNS) throw new HttpError(400, "回合數不符");
  const stats = body.stats as Record<string, unknown> | null;
  if (!stats || stats.settled !== true || stats.position !== 0)
    throw new HttpError(400, "請完成平倉結算後再上傳成績");
  const seed = body.seed;
  if (!Number.isSafeInteger(seed) || (seed as number) < 1 || (seed as number) > 0xffffffff)
    throw new HttpError(400, "種子不對");
  const pnl = body.pnl;
  if (typeof pnl !== "number" || !Number.isFinite(pnl) || Math.abs(pnl) > PNL_LIMIT)
    throw new HttpError(400, "損益不合理");
  const actions = body.actions;
  const problem = checkActions(actions, RANKED_TURNS);
  if (problem) throw new HttpError(400, problem);
  const list = actions as { t: number; op: string; args?: Record<string, unknown> }[];
  if (list.length > MAX_ACTIONS) throw new HttpError(400, "操作太多");
  return {
    version: RANKED_VERSION,
    turns: RANKED_TURNS,
    seed: seed as number,
    pnl: Math.round(pnl * 100) / 100,
    name: cleanName(body.name),
    stats: pickStats(body.stats),
    actions: list,
  };
}

// Printable text only, collapsed spaces, at most 18 characters.
export function cleanName(value: unknown): string {
  const name = String(value ?? "")
    .normalize("NFKC")
    .replace(/[\p{C}<>]/gu, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, NAME_MAX);
  if (!name) throw new HttpError(400, "請輸入名稱");
  return name;
}

// The stats a score keeps; scripts/arena-verify-scores.ts stores old scores' replays the same way.
export function pickStats(value: unknown) {
  const stats = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
  const number = (key: string) =>
    typeof stats[key] === "number" && Number.isFinite(stats[key]) ? (stats[key] as number) : 0;
  return {
    settled: true,
    position: 0,
    volume: number("volume"),
    liquidations: number("liquidations"),
    ignited: number("ignited"),
  };
}

// The score is the replay's, whatever the page claimed. A page on another JavaScript engine can
// round a float differently and end elsewhere; the log keeps those apart from forged claims.
function replayScore(score: ReturnType<typeof parseScore>, replay: typeof replayRanked) {
  let result: ReturnType<typeof replayRanked>;
  try {
    result = replay({ seed: score.seed, actions: score.actions, turns: score.turns });
  } catch (error) {
    const unsettled = error instanceof Error && error.message.includes("平倉");
    if (!unsettled)
      console.error(
        JSON.stringify({ event: "arena.replay.failed", errorType: error instanceof Error ? error.name : "Unknown" }),
      );
    throw new HttpError(400, unsettled ? (error as Error).message : "操作紀錄無法重播，請重新整理後再玩");
  }
  if (result.pnl !== score.pnl)
    console.log(JSON.stringify({ event: "arena.score.replayed", claimed: score.pnl, replayed: result.pnl }));
  return { pnl: result.pnl, stats: pickStats(result) };
}

// A hash of the client address, only to slow down repeated uploads, and cleared once the hour it
// counts has passed. With ARENA_IP_KEY set it is keyed, so a copy of the table cannot be reversed
// by hashing every IPv4 address.
async function hashClient(request: Request, key?: string): Promise<string> {
  const ip = new TextEncoder().encode(`flow-arena:${request.headers.get("CF-Connecting-IP") ?? "local"}`);
  const digest = key
    ? await crypto.subtle.sign(
        "HMAC",
        await crypto.subtle.importKey("raw", new TextEncoder().encode(key), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]),
        ip,
      )
    : await crypto.subtle.digest("SHA-256", ip);
  return [...new Uint8Array(digest).slice(0, 12)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}
