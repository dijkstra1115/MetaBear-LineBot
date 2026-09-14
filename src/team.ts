import { HttpError, textField } from "./http";
export type Team = {
  id: number;
  name: string;
  referral_code: string;
  inviter_uid: string;
  allow_indirect: number;
  allow_internal_transfer: number;
  automation_enabled: number;
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
// Request-local transformation keeps team settings out of global shared state.
export function teamText(text: string, team: Team): string {
  return text
    .replaceAll("MetaBear", team.name)
    .replaceAll("ZD0CQ0", team.referral_code)
    .replaceAll(
      "允許內部轉帳",
      team.allow_internal_transfer
        ? "允許內部轉帳"
        : "僅接受一般充值，不計內部轉帳",
    )
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
