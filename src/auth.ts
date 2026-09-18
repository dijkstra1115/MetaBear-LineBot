import { createRemoteJWKSet, jwtVerify } from "jose";
import { authorized, HttpError } from "./http";
import { nativeIdentity } from "./native-auth";

// Cache public signing keys only; never store a user's JWT or identity globally.
const keySets = new Map<string, ReturnType<typeof createRemoteJWKSet>>();
export type AdminIdentity = {
  email: string;
  mode: "cloudflare" | "local" | "native";
  role: "admin" | "analyst";
};

export async function staffIdentity(
  request: Request,
  env: Env,
): Promise<AdminIdentity> {
  if (env.AUTH_MODE === "native") return nativeIdentity(request, env);
  const identity = await adminIdentity(request, env);
  return { ...identity, role: "admin" };
}

export async function adminIdentity(
  request: Request,
  env: Env,
): Promise<AdminIdentity> {
  if (env.AUTH_MODE === "native") {
    const identity = await nativeIdentity(request, env);
    if (identity.role !== "admin")
      throw new HttpError(403, "分析師請使用報單工作台");
    return identity;
  }
  if (
    env.ENVIRONMENT === "development" &&
    env.LINE_DELIVERY_MODE === "disabled"
  ) {
    if (await authorized(request, env.ADMIN_TOKEN))
      return {
        email: env.ADMIN_EMAIL.trim().toLowerCase() || "local-preview",
        mode: "local",
        role: "admin",
      };
    throw new HttpError(401, "請輸入本機管理金鑰");
  }
  if (
    !env.ACCESS_AUD ||
    !/^[a-z0-9-]+\.cloudflareaccess\.com$/.test(env.ACCESS_TEAM_DOMAIN) ||
    !env.ADMIN_EMAIL
  )
    throw new HttpError(503, "管理員登入尚未完成設定");
  const token = request.headers.get("Cf-Access-Jwt-Assertion");
  if (!token || token.length > 16384)
    throw new HttpError(401, "請透過 Cloudflare 驗證 email 後登入");
  const issuer = `https://${env.ACCESS_TEAM_DOMAIN}`;
  let keySet = keySets.get(issuer);
  if (!keySet) {
    keySet = createRemoteJWKSet(new URL(`${issuer}/cdn-cgi/access/certs`), {
      timeoutDuration: 5000,
    });
    keySets.set(issuer, keySet);
  }
  let email: string;
  try {
    const { payload } = await jwtVerify(token, keySet, {
      issuer,
      audience: env.ACCESS_AUD,
      algorithms: ["RS256"],
      requiredClaims: ["exp", "iat", "sub", "email"],
    });
    if (
      typeof payload.email !== "string" ||
      payload.email.toLowerCase() !== env.ADMIN_EMAIL.toLowerCase()
    )
      throw new Error("Email not allowed");
    email = payload.email;
  } catch {
    throw new HttpError(403, "這個登入工作階段無法存取後台，請重新登入");
  }
  if (!["GET", "HEAD", "OPTIONS"].includes(request.method)) {
    if (
      request.headers.get("Origin") !== new URL(request.url).origin ||
      request.headers.get("X-MetaBear-Request") !== "crm"
    )
      throw new HttpError(403, "操作來源驗證失敗，請從後台重新操作");
    if (
      !request.headers
        .get("Content-Type")
        ?.toLowerCase()
        .startsWith("application/json")
    )
      throw new HttpError(415, "操作需使用 JSON 格式");
  }
  return { email, mode: "cloudflare", role: "admin" };
}
