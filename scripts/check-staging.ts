// Live infrastructure and LINE validation checks. Never sends chat messages.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHmac } from "node:crypto";
import { guide, menu, STEPS } from "../src/content";

const base = "https://metabear-line-crm-staging.style78432.workers.dev";
const secrets = Object.fromEntries(
  (await readFile(".dev.vars.staging", "utf8"))
    .split(/\r?\n/)
    .filter((line) => /^[A-Z_]+=/.test(line))
    .map((line) => {
      const at = line.indexOf("=");
      return [line.slice(0, at), line.slice(at + 1)];
    }),
);
const request = (url: string, init?: RequestInit) =>
  fetch(url, { ...init, signal: AbortSignal.timeout(20000) });
const auth = { Authorization: `Bearer ${secrets.ADMIN_TOKEN}` };
assert.equal((await request(base + "/health")).status, 200);
for (const path of [
  ...new Set(
    Object.values(STEPS).flatMap(
      (s) => s.images?.map((i) => i.src) ?? (s.image ? [s.image] : []),
    ),
  ),
]) {
  const response = await request(base + path);
  assert.equal(response.status, 200, path);
  assert.match(response.headers.get("content-type") ?? "", /image\/jpeg/);
  const bytes = new Uint8Array(await response.arrayBuffer());
  assert.equal(bytes[0], 0xff);
  assert.equal(bytes[1], 0xd8);
  console.log(
    JSON.stringify({ check: "public image", path, bytes: bytes.length }),
  );
}
for (const path of ["/", "/learn", "/content.json", "/site.js"])
  assert.equal((await request(base + path)).status, 200, path);
for (const path of [
  "/admin",
  "/admin/",
  "/admin.html",
  "/api/customers",
  "/api/config",
]) {
  const r = await request(base + path, { redirect: "manual", headers: auth });
  assert.equal(r.status, 302, path);
  assert.match(
    r.headers.get("location") ?? "",
    /^https:\/\/id3a\.cloudflareaccess\.com\//,
  );
}
const body = JSON.stringify({ events: [] });
assert.equal(
  (await request(base + "/webhook/line", { method: "POST", body })).status,
  401,
);
const signed = await request(base + "/webhook/line", {
  method: "POST",
  body,
  headers: {
    "X-Line-Signature": createHmac("sha256", secrets.LINE_CHANNEL_SECRET)
      .update(body)
      .digest("base64"),
  },
});
assert.equal(signed.status, 200, "Configured signature");
console.log(
  JSON.stringify({
    check: "Worker public assets, Access redirects and webhook signatures",
    passed: true,
    deliveryMode: "live",
  }),
);
const lineHeaders = {
  Authorization: `Bearer ${secrets.LINE_CHANNEL_ACCESS_TOKEN}`,
  "Content-Type": "application/json",
};
// The endpoint parameter tests this URL without changing the channel's saved URL.
const verify = await request(
  "https://api.line.me/v2/bot/channel/webhook/test",
  {
    method: "POST",
    headers: lineHeaders,
    body: JSON.stringify({ endpoint: base + "/webhook/line" }),
  },
);
assert.equal(verify.status, 200, "LINE webhook test API");
const result = (await verify.json()) as any;
console.log(
  JSON.stringify({
    check: "LINE actual webhook request",
    success: result.success,
    statusCode: result.statusCode,
    reason: result.reason,
  }),
);
assert.equal(
  result.success,
  true,
  "LINE must verify its own request using the real channel secret",
);
for (const [name, messages] of [
  ["welcome", [menu()]],
  ["registration image", guide("register", base, true)],
  ["KYC image", guide("kyc", base, true)],
  ...(["deposit_bitopro", "deposit_card"] as const).flatMap((step) =>
    [0, 1, 2].map(
      (page) =>
        [step + " page " + page, guide(step, base, true, false, page)] as const,
    ),
  ),
] as const) {
  const validation = await request(
    "https://api.line.me/v2/bot/message/validate/reply",
    {
      method: "POST",
      headers: lineHeaders,
      body: JSON.stringify({ messages }),
    },
  );
  assert.equal(validation.status, 200, name);
  console.log(
    JSON.stringify({ check: "LINE message schema", name, passed: true }),
  );
}
console.log(
  JSON.stringify({ webhook: base + "/webhook/line", chatMessagesSent: 0 }),
);
