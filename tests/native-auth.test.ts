import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { build } from "esbuild";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { generateKeyPair, exportJWK, SignJWT } from "jose";
import { enrollFromLine } from "../src/auth-enrollment";

const email = "owner@example.test",
  userId = "U" + "a".repeat(32);
let mf: Miniflare,
  db: Awaited<ReturnType<Miniflare["getD1Database"]>>,
  jwt: string;
let pushes: any[] = [],
  failPush = false;
const call = (
  path: string,
  body?: unknown,
  cookie = "",
  extra: Record<string, string> = {},
) =>
  mf.dispatchFetch("https://crm.test" + path, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      Origin: "https://crm.test",
      "X-MetaBear-Request": "crm",
      "Content-Type": "application/json",
      Cookie: cookie,
      ...extra,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
const challengeCookie = (response: Response) =>
  response.headers.get("set-cookie")!.split(";")[0];
const code = () => pushes.at(-1).messages[0].text.match(/：([0-9]{6})/)[1];
async function requestCode() {
  const response = await call("/auth/request", { email });
  assert.equal(response.status, 200, await response.clone().text());
  return { cookie: challengeCookie(response), code: code() };
}
before(async () => {
  const keys = await generateKeyPair("RS256");
  const jwk = { ...(await exportJWK(keys.publicKey)), kid: "test" };
  jwt = await new SignJWT({ email })
    .setProtectedHeader({ alg: "RS256", kid: "test" })
    .setIssuer("https://id3a.cloudflareaccess.com")
    .setAudience("metabear-test")
    .setSubject("owner")
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(keys.privateKey);
  const output = await build({
    stdin: {
      contents: `import worker from './src/index'; export default {fetch(req,env,ctx){return worker.fetch(req,{...env,AUTH_MODE:req.headers.get('X-Test-Mode')||'native'},ctx)}}`,
      resolveDir: process.cwd(),
    },
    bundle: true,
    write: false,
    format: "esm",
    platform: "neutral",
    target: "es2022",
  });
  mf = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      script: output.outputFiles[0].text,
      compatibilityDate: "2026-09-11",
      compatibilityFlags: ["nodejs_compat"],
      d1Databases: ["DB"],
      bindings: {
        ADMIN_EMAIL: email,
        AUTH_CHANNEL: "line",
        LINE_DELIVERY_MODE: "live",
        LINE_CHANNEL_ACCESS_TOKEN: "test",
        ENVIRONMENT: "staging",
        ACCESS_AUD: "metabear-test",
        ACCESS_TEAM_DOMAIN: "id3a.cloudflareaccess.com",
      },
      serviceBindings: {
        ASSETS: async () => new Response("<html>private workspace</html>"),
      },
      outboundService: async (request: Request) => {
        if (
          request.url ===
          "https://id3a.cloudflareaccess.com/cdn-cgi/access/certs"
        )
          return Response.json({ keys: [jwk] });
        assert.equal(request.url, "https://api.line.me/v2/bot/message/push");
        assert.equal(request.headers.get("authorization"), "Bearer test");
        const body = await request.json();
        pushes.push(body);
        return Response.json({}, { status: failPush ? 503 : 200 });
      },
    }),
  );
  db = await mf.getD1Database("DB");
  await db.exec(
    (await readFile("migrations/0006_native_auth.sql", "utf8")).replace(
      /\n/g,
      " ",
    ),
  );
  await db.exec(
    "CREATE TABLE IF NOT EXISTS staff (email TEXT PRIMARY KEY, name TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'analyst', enabled INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL DEFAULT '', created_by TEXT NOT NULL);",
  );
});
beforeEach(async () => {
  await db.exec(
    "DELETE FROM auth_rate_limits; DELETE FROM auth_challenges; DELETE FROM auth_sessions; DELETE FROM auth_line_enrollments; DELETE FROM auth_admin_channels; DELETE FROM staff;",
  );
  await db
    .prepare("INSERT INTO auth_admin_channels VALUES (?,?,?,?)")
    .bind(email, userId, 1, "initial")
    .run();
  pushes = [];
  failPush = false;
});
after(async () => {
  await mf?.dispose();
});

test("native admin rejects Access JWT and redirects private HTML to its own login", async () => {
  assert.equal(
    (
      await call("/api/config", undefined, "", {
        "Cf-Access-Jwt-Assertion": jwt,
      })
    ).status,
    401,
  );
  for (const path of [
    "/admin",
    "/admin/",
    "/admin.html",
    "/admin/login-setup",
  ]) {
    const r = await mf.dispatchFetch("https://crm.test" + path, {
      redirect: "manual",
    });
    assert.equal(r.status, 302);
    assert.equal(r.headers.get("location"), "/login");
  }
  assert.equal((await call("/login")).status, 200);
});
test("LINE OTP uses server-bound recipient, hashed storage and independent revocable session", async () => {
  const c = await requestCode();
  assert.equal(pushes[0].to, userId);
  const row = await db.prepare("SELECT * FROM auth_challenges").first<any>();
  assert.notEqual(row.code_hash, c.code);
  assert.notEqual(row.id_hash, c.cookie.split("=")[1]);
  assert.equal((await call("/auth/verify", { code: c.code })).status, 401);
  const verified = await call("/auth/verify", { code: c.code }, c.cookie);
  assert.equal(verified.status, 200);
  assert.match(
    verified.headers.get("set-cookie")!,
    /HttpOnly; Secure; SameSite=Strict/,
  );
  const session = challengeCookie(verified);
  assert.deepEqual(
    await (await call("/auth/session", undefined, session)).json(),
    { email, mode: "native", role: "admin" },
  );
  assert.equal((await call("/admin", undefined, session)).status, 200);
  assert.equal(
    (await call("/auth/verify", { code: c.code }, c.cookie)).status,
    401,
  );
  assert.equal((await call("/auth/logout", {}, session)).status, 200);
  assert.equal((await call("/auth/session", undefined, session)).status, 401);
});
test("OTP permits at most five guesses and rejects expired challenges and sessions", async () => {
  const c = await requestCode();
  const wrong = c.code === "000000" ? "111111" : "000000";
  const guesses = await Promise.all(
    Array.from({ length: 8 }, () =>
      call("/auth/verify", { code: wrong }, c.cookie),
    ),
  );
  assert.ok(guesses.every((r) => r.status === 401));
  assert.equal(
    (await db.prepare("SELECT attempts FROM auth_challenges").first<any>())
      .attempts,
    5,
  );
  assert.equal(
    (await call("/auth/verify", { code: c.code }, c.cookie)).status,
    401,
  );
  await db.exec("UPDATE auth_challenges SET attempts=0,expires_at=0;");
  assert.equal(
    (await call("/auth/verify", { code: c.code }, c.cookie)).status,
    401,
  );
});
test("concurrent correct OTP requests create exactly one session", async () => {
  const c = await requestCode();
  const responses = await Promise.all([
    call("/auth/verify", { code: c.code }, c.cookie),
    call("/auth/verify", { code: c.code }, c.cookie),
  ]);
  assert.deepEqual(responses.map((r) => r.status).sort(), [200, 401]);
  assert.equal(
    (await db.prepare("SELECT COUNT(*) AS n FROM auth_sessions").first<any>())
      .n,
    1,
  );
  await db.exec("UPDATE auth_sessions SET expires_at=0;");
  assert.equal(
    (
      await call(
        "/auth/session",
        undefined,
        challengeCookie(responses.find((r) => r.status === 200)!),
      )
    ).status,
    401,
  );
});
test("delivery limits are atomic, unknown email sends nothing, provider failure never creates usable OTP", async () => {
  assert.equal(
    (
      await call("/auth/request", {
        email: "stranger@example.test",
        lineUserId: userId,
      })
    ).status,
    200,
  );
  assert.equal(pushes.length, 0);
  const requests = await Promise.all([
    call("/auth/request", { email }),
    call("/auth/request", { email }),
  ]);
  assert.deepEqual(requests.map((r) => r.status).sort(), [200, 429]);
  assert.equal(pushes.length, 1);
  await db.exec("DELETE FROM auth_rate_limits; DELETE FROM auth_challenges;");
  failPush = true;
  const failed = await call("/auth/request", { email });
  assert.equal(failed.status, 503);
  assert.equal(failed.headers.get("set-cookie"), null);
  assert.equal(
    (await db.prepare("SELECT COUNT(*) AS n FROM auth_challenges").first<any>())
      .n,
    0,
  );
});
test("cross-origin and missing-CSRF-header mutations cannot request codes or revoke sessions", async () => {
  assert.equal(
    (
      await call("/auth/request", { email }, "", {
        Origin: "https://evil.test",
      })
    ).status,
    403,
  );
  assert.equal(
    (await call("/auth/request", { email }, "", { "X-MetaBear-Request": "" }))
      .status,
    403,
  );
  const c = await requestCode();
  const s = challengeCookie(
    await call("/auth/verify", { code: c.code }, c.cookie),
  );
  assert.equal(
    (await call("/auth/logout", {}, s, { Origin: "https://evil.test" })).status,
    403,
  );
  assert.equal((await call("/auth/session", undefined, s)).status, 200);
});
test("enrollment requires existing admin auth; signed-in-issued code binds once and revokes prior sessions", async () => {
  assert.equal(
    (
      await call("/api/auth/line-enrollment", {}, "", {
        "X-Test-Mode": "native-preview",
      })
    ).status,
    401,
  );
  const result = await call("/api/auth/line-enrollment", {}, "", {
    "X-Test-Mode": "native-preview",
    "Cf-Access-Jwt-Assertion": jwt,
  });
  assert.equal(result.status, 200, await result.clone().text());
  const enrollment = (await result.json()) as any;
  const c = await requestCode();
  const s = challengeCookie(
    await call("/auth/verify", { code: c.code }, c.cookie),
  );
  const env = {
    DB: db,
    ADMIN_EMAIL: email,
    AUTH_CHANNEL: "line",
  } as unknown as Env;
  const newUser = "U" + "b".repeat(32);
  const bound = await enrollFromLine(
    env,
    newUser,
    enrollment.command,
    "signed-event",
  );
  assert.match((bound![0] as any).text, /已完成/);
  assert.equal((await call("/auth/session", undefined, s)).status, 401);
  assert.equal(
    (
      await db
        .prepare("SELECT line_user_id FROM auth_admin_channels")
        .first<any>()
    ).line_user_id,
    newUser,
  );
  assert.match(
    (
      (await enrollFromLine(
        env,
        newUser,
        enrollment.command,
        "signed-event",
      ))![0] as any
    ).text,
    /已完成/,
  );
  assert.match(
    (
      (await enrollFromLine(
        env,
        userId,
        enrollment.command,
        "other-event",
      ))![0] as any
    ).text,
    /無效/,
  );
  assert.equal(
    (
      await db
        .prepare("SELECT line_user_id FROM auth_admin_channels")
        .first<any>()
    ).line_user_id,
    newUser,
  );
});
test("enabled analyst uses LINE OTP but cannot open the CRM", async () => {
  const analystEmail = "analyst@example.test";
  const analystUser = "U" + "c".repeat(32);
  await db
    .prepare("INSERT INTO staff(email,name,created_by) VALUES (?,?,?)")
    .bind(analystEmail, "阿熊", email)
    .run();
  await db
    .prepare("INSERT INTO auth_admin_channels VALUES (?,?,?,?)")
    .bind(analystEmail, analystUser, 1, "analyst-enroll")
    .run();
  const requested = await call("/auth/request", { email: analystEmail });
  assert.equal(requested.status, 200, await requested.clone().text());
  assert.equal(pushes.at(-1).to, analystUser);
  const verified = await call(
    "/auth/verify",
    { code: code() },
    challengeCookie(requested),
  );
  assert.equal(verified.status, 200, await verified.clone().text());
  const session = challengeCookie(verified);
  assert.deepEqual(
    await (await call("/auth/session", undefined, session)).json(),
    { email: analystEmail, mode: "native", role: "analyst" },
  );
  assert.equal((await call("/api/config", undefined, session)).status, 403);
  assert.equal((await call("/api/customers", undefined, session)).status, 403);
  const adminPage = await mf.dispatchFetch("https://crm.test/admin", {
    headers: { Cookie: session },
    redirect: "manual",
  });
  assert.equal(adminPage.status, 302);
  assert.equal(adminPage.headers.get("location"), "/desk");
  assert.equal((await call("/desk", undefined, session)).status, 200);
});
test("owner stays admin after being listed as analyst", async () => {
  await db
    .prepare("INSERT INTO staff(email,name,created_by) VALUES (?,?,?)")
    .bind(email, "管理員", email)
    .run();
  const c = await requestCode();
  const verified = await call("/auth/verify", { code: c.code }, c.cookie);
  assert.equal(verified.status, 200, await verified.clone().text());
  const session = challengeCookie(verified);
  assert.deepEqual(
    await (await call("/auth/session", undefined, session)).json(),
    { email, mode: "native", role: "admin" },
  );
  assert.equal((await call("/admin", undefined, session)).status, 200);
  assert.equal((await call("/desk", undefined, session)).status, 200);
});
