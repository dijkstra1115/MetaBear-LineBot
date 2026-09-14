import { readBody } from "./http";

export type Row = Record<string, unknown>;
export class BingxError extends Error {
  constructor(public code: string) {
    super(`BingX ${code}`);
    this.name = "BingxError";
  }
}
export function record(value: unknown): Row {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new BingxError("invalid_response");
  return value as Row;
}
export function flag(value: unknown): boolean | null {
  return value === true || value === "true"
    ? true
    : value === false || value === "false"
      ? false
      : null;
}
export function decimal(value: unknown): string {
  if (typeof value !== "string" || !/^\d{1,20}(\.\d{1,18})?$/.test(value))
    throw new BingxError("invalid_decimal");
  return value;
}
export function sumDecimal(values: string[]): string {
  const scale = 10n ** 18n;
  const total = values.reduce((sum, value) => {
    const [whole, fraction = ""] = decimal(value).split(".");
    return sum + BigInt(whole) * scale + BigInt(fraction.padEnd(18, "0"));
  }, 0n);
  const tail = (total % scale).toString().padStart(18, "0").replace(/0+$/, "");
  return (total / scale).toString() + (tail ? "." + tail : "");
}
export function taipeiDay(timestamp: number) {
  return new Date(timestamp + 8 * 3600000).toISOString().slice(0, 10);
}
export function dayStart(day: string) {
  return Date.parse(day + "T00:00:00+08:00");
}
export const DAY = 86400000;

export class BingxClient {
  private lastCall = 0;
  private startedAt = Date.now();
  constructor(
    private key: string,
    private secret: string,
  ) {}
  async get(
    path: string,
    params: Record<string, string | number>,
  ): Promise<unknown> {
    if (Date.now() - this.startedAt > 120000)
      throw new BingxError("request_budget_exceeded");
    if (!this.key || !this.secret) throw new BingxError("not_configured");
    const pause = 550 - (Date.now() - this.lastCall);
    if (pause > 0) await new Promise((resolve) => setTimeout(resolve, pause));
    this.lastCall = Date.now();
    const all: Record<string, string | number> = {
      ...params,
      timestamp: Date.now(),
      recvWindow: 5000,
    };
    for (const value of Object.values(all))
      if (!/^[\w.-]+$/.test(String(value)))
        throw new BingxError("invalid_parameter");
    const query = Object.keys(all)
      .sort()
      .map((key) => `${key}=${all[key]}`)
      .join("&");
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(this.secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    const signature = Array.from(
      new Uint8Array(
        await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(query)),
      ),
      (b) => b.toString(16).padStart(2, "0"),
    ).join("");
    let response: Response;
    try {
      response = await fetch(
        `https://open-api.bingx.com${path}?${query}&signature=${signature}`,
        {
          headers: { "X-BX-APIKEY": this.key, "X-SOURCE-KEY": "BX-AI-SKILL" },
          signal: AbortSignal.timeout(10000),
          redirect: "manual",
        },
      );
    } catch (error) {
      const type = error instanceof Error && ['TimeoutError','AbortError','TypeError'].includes(error.name) ? error.name : 'network';
      throw new BingxError(type);
    }
    if (!response.ok) {
      await response.body?.cancel();
      throw new BingxError(`http_${response.status}`);
    }
    // Bound each page and preserve large UID numbers as strings before JSON parsing.
    const raw = await readBody(
      new Request("https://response.local", {
        method: "POST",
        body: response.body,
        duplex: "half",
      } as RequestInit),
      2_000_000,
    );
    let parsed: Row;
    try {
      parsed = record(
        JSON.parse(
          raw.replace(
            /("(?:uid|inviterSid|currentAgentUid)"\s*:\s*)(\d+)/g,
            '$1"$2"',
          ),
        ),
      );
    } catch {
      throw new BingxError("invalid_response");
    }
    if (parsed.code !== 0)
      throw new BingxError(
        String(parsed.code)
          .replace(/[^\w-]/g, "")
          .slice(0, 40),
      );
    return parsed.data;
  }
  async relation(uid: string) {
    return record(
      await this.get("/openApi/agent/v1/account/inviteRelationCheck", { uid }),
    );
  }
  async pages(
    path: string,
    params: Record<string, string | number>,
    uid: string,
  ): Promise<Row[]> {
    const rows: Row[] = [];
    for (let pageIndex = 1; pageIndex <= 20; pageIndex++) {
      const value = await this.get(path, {
        ...params,
        pageIndex,
        pageSize: 100,
      });
      if (value === null || value === undefined) {
        if (pageIndex === 1) return [];
        throw new BingxError("incomplete_page");
      }
      const data = record(value);
      if (!Array.isArray(data.list)) throw new BingxError("invalid_list");
      const page = data.list.map(record);
      if (page.some((row) => String(row.uid) !== uid))
        throw new BingxError("uid_mismatch");
      rows.push(...page);
      const total = data.total;
      if (total !== undefined && total !== null) {
        if (
          !Number.isSafeInteger(total) ||
          Number(total) < 0 ||
          rows.length > Number(total)
        )
          throw new BingxError("invalid_total");
        if (rows.length === total) return rows;
        if (page.length === 0) throw new BingxError("incomplete_page");
      } else if (page.length < 100) return rows;
    }
    throw new BingxError("pagination_limit");
  }
}
