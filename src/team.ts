import { HttpError, textField } from "./http";
export type Team = {
  id: number;
  name: string;
  referral_code: string;
  inviter_uid: string;
  allow_indirect: number;
  allow_internal_transfer: number;
  deposit_min_usdt: number;
  automation_enabled: number;
  signals_enabled: number;
  vip_url: string;
  support_url: string;
  revision: number;
  updated_at: string;
};
export async function getTeam(db: D1Database): Promise<Team> {
  const team = await db
    .prepare("SELECT * FROM team_settings WHERE id=1")
    .first<Team>();
  if (!team) throw new HttpError(503, "請先套用 CRM 資料庫遷移");
  return team;
}
export function validateTeam(
  data: Record<string, unknown>,
  current: Team,
): Team {
  const next = { ...current };
  next.name = textField(data.name, 80, current.name);
  next.referral_code = textField(data.referral_code, 40, current.referral_code);
  next.inviter_uid = textField(data.inviter_uid, 30, current.inviter_uid);
  if (
    !next.name ||
    !/^[A-Za-z0-9]{1,40}$/.test(next.referral_code) ||
    (next.inviter_uid && !/^\d{4,30}$/.test(next.inviter_uid))
  )
    throw new HttpError(400, "請填寫團隊名稱、有效邀請碼及邀請人 UID");
  for (const key of [
    "allow_indirect",
    "allow_internal_transfer",
    "automation_enabled",
  ] as const) {
    if (data[key] !== undefined) {
      if (typeof data[key] !== "boolean")
        throw new HttpError(400, "設定開關格式不正確");
      next[key] = data[key] ? 1 : 0;
    }
  }
  if (data.deposit_min_usdt !== undefined) {
    if (!Number.isInteger(data.deposit_min_usdt) || (data.deposit_min_usdt as number) < 0 || (data.deposit_min_usdt as number) > 1_000_000)
      throw new HttpError(400, "入金門檻請填 0 到 1000000 的整數 USDT");
    next.deposit_min_usdt = data.deposit_min_usdt as number;
  }
  for (const key of ["vip_url", "support_url"] as const) {
    next[key] = textField(data[key], 1000, current[key]);
    if (next[key]) {
      try {
        const url = new URL(next[key]);
        if (url.protocol !== "https:" || url.username || url.password)
          throw new Error();
      } catch {
        throw new HttpError(400, "連結必須是有效 HTTPS 網址");
      }
    }
  }
  if (next.automation_enabled && !next.vip_url)
    throw new HttpError(400, "啟用自動審核前，請設定 VIP 邀請連結");
  return next;
}
/** The deposit condition in words, e.g. "60 日內累計入金 200 USDT（不含內部轉帳）". */
export function depositRule(team: Team): string {
  const internal = team.allow_internal_transfer ? "含" : "不含";
  return team.deposit_min_usdt > 0
    ? `60 日內累計入金 ${team.deposit_min_usdt} USDT（${internal}內部轉帳）`
    : `已入金即可（${team.allow_internal_transfer ? "允許" : "不計"}內部轉帳）`;
}
// Copy states the default rule with this phrase; teams with other settings get theirs.
export const DEPOSIT_RULE_TEXT = "60 日內累計入金 200 USDT（不含內部轉帳）";
// Request-local transformation keeps team settings out of global shared state.
export function teamText(text: string, team: Team): string {
  return text
    .replaceAll("MetaBear", team.name)
    .replaceAll("ZD0CQ0", team.referral_code)
    .replaceAll(DEPOSIT_RULE_TEXT, depositRule(team))
    .replaceAll(
      "允許內部轉帳",
      team.allow_internal_transfer
        ? "允許內部轉帳"
        : "僅接受一般充值，不計內部轉帳",
    )
    .replaceAll(
      "https://lin.ee/cbyuRJv",
      team.support_url || "https://lin.ee/cbyuRJv",
    );
}
export function personalize<T>(value: T, team: Team): T {
  // Values are trusted lesson/message objects, never user financial records.
  function walk(item: unknown): unknown {
    if (typeof item === "string") return teamText(item, team);
    if (Array.isArray(item)) return item.map(walk);
    if (item && typeof item === "object")
      return Object.fromEntries(
        Object.entries(item).map(([key, val]) => [key, walk(val)]),
      );
    return item;
  }
  return walk(value) as T;
}
