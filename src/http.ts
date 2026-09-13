export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export async function readBody(
  request: Request,
  limit = 65536,
): Promise<string> {
  const reader = request.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let length = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    length += value.length;
    if (length > limit) {
      await reader.cancel();
      throw new HttpError(413, "資料太大");
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return new TextDecoder().decode(bytes);
}
export async function readJson(
  request: Request,
): Promise<Record<string, unknown>> {
  try {
    const result: unknown = JSON.parse(await readBody(request));
    if (!result || typeof result !== "object" || Array.isArray(result))
      throw new Error();
    return result as Record<string, unknown>;
  } catch (e) {
    if (e instanceof HttpError) throw e;
    throw new HttpError(400, "JSON 格式不正確");
  }
}
export function json(value: unknown, status = 200) {
  return Response.json(value, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
export async function signatureValid(
  body: string,
  signature: string,
  secret: string,
): Promise<boolean> {
  if (!secret || !/^[A-Za-z0-9+/]{43}=$/.test(signature)) return false;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"],
  );
  return crypto.subtle.verify(
    "HMAC",
    key,
    Uint8Array.from(atob(signature), (c) => c.charCodeAt(0)),
    new TextEncoder().encode(body),
  );
}
export async function authorized(
  request: Request,
  token: string,
): Promise<boolean> {
  if (!token || token.length < 32 || token.startsWith("replace-with-"))
    return false;
  const provided = request.headers.get("Authorization") ?? "";
  const [expectedHash, actualHash] = await Promise.all([
    crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(`Bearer ${token}`),
    ),
    crypto.subtle.digest("SHA-256", new TextEncoder().encode(provided)),
  ]);
  return crypto.subtle.timingSafeEqual(expectedHash, actualHash);
}
export function textField(value: unknown, max: number, fallback = ""): string {
  if (value === undefined) return fallback;
  if (typeof value !== "string" || value.length > max)
    throw new HttpError(400, `文字必須少於 ${max} 字`);
  return value.trim();
}
export function choice<T extends string>(
  value: unknown,
  choices: readonly T[],
): T {
  if (typeof value !== "string" || !choices.includes(value as T))
    throw new HttpError(400, "選項不正確");
  return value as T;
}
