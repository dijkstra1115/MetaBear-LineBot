import {
  MAX_ACTIONS,
  RANKED_TURNS,
  RANKED_VERSION,
  SETTLED_SEASON_VERSION,
  checkActions,
} from "../public/arena/engine/ranked.js";
import { HttpError, json, readBody } from "./http";

// FLOW ARENA ranked leaderboard. Replaying a game to verify it needs about a second and a half of
// CPU, more than the Workers free plan allows per request, so a score is accepted after shape and
// plausibility checks and stored with its seed and action log; a later job on a paid plan can
// replay the logs and mark scores as verified (or remove them).
export interface ArenaEnv {
  ARENA_DB?: D1Database;
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
    const ipHash = await hashClient(request);
    const recent = await db
      .prepare(
        "SELECT COUNT(*) AS n FROM arena_scores WHERE ip_hash = ? AND created_at > datetime('now', '-1 hour')",
      )
      .bind(ipHash)
      .first<{ n: number }>();
    if ((recent?.n ?? 0) >= HOURLY_UPLOADS)
      throw new HttpError(429, "上傳太頻繁，請稍後再試");
    const inserted = await db
      .prepare(
        "INSERT INTO arena_scores (name, pnl, seed, turns, version, stats, actions, ip_hash) VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING id",
      )
      .bind(
        score.name,
        score.pnl,
        score.seed,
        score.turns,
        score.version,
        JSON.stringify(score.stats),
        JSON.stringify(score.actions),
        ipHash,
      )
      .first<{ id: number }>();
    const better = await db
      .prepare("SELECT COUNT(*) AS n FROM arena_scores WHERE version >= ? AND pnl > ?")
      .bind(SETTLED_SEASON_VERSION, score.pnl)
      .first<{ n: number }>();
    return json({ id: inserted?.id, rank: (better?.n ?? 0) + 1, season: "current" }, 201);
  } catch (error) {
    if (error instanceof HttpError) return json({ error: error.message }, error.status);
    throw error;
  }
}

async function topScores(db: D1Database, season: "current" | "legacy") {
  const { results } = await db
    .prepare(
      `SELECT id, name, pnl, seed, turns, verified, created_at, json_extract(stats, '$.recalculatedFrom') AS source_score_id FROM arena_scores WHERE version ${season === "legacy" ? "<" : ">="} ? ORDER BY pnl DESC, id ASC LIMIT ?`,
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
  const list = actions as { op: string }[];
  if (list.length > MAX_ACTIONS) throw new HttpError(400, "操作太多");
  // Only orders change the result; without any, the only honest outcome is zero.
  const traded = list.some((action) => action.op === "enqueue" || action.op === "execute");
  if (!traded && pnl !== 0) throw new HttpError(400, "沒有交易卻有損益");
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

function pickStats(value: unknown) {
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

// A salted hash of the client address, only to slow down repeated uploads.
async function hashClient(request: Request): Promise<string> {
  const ip = request.headers.get("CF-Connecting-IP") ?? "local";
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(`flow-arena:${ip}`),
  );
  return [...new Uint8Array(digest).slice(0, 12)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}
