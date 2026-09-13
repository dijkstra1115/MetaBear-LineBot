// Manual, paid smoke test. Never included in npm test and never sends to LINE.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { routeQuestion, isStep, type TeachingContext } from "../src/assistant";
import { guide } from "../src/content";

const vars = Object.fromEntries(
  (await readFile(".dev.vars", "utf8"))
    .split(/\r?\n/)
    .filter((line) => /^[A-Z_]+=/.test(line))
    .map((line) => {
      const at = line.indexOf("=");
      return [line.slice(0, at), line.slice(at + 1)];
    }),
);
assert.ok(vars.OPENAI_API_KEY, "Set OPENAI_API_KEY in .dev.vars first");
const env = {
  OPENAI_API_KEY: vars.OPENAI_API_KEY,
  OPENAI_MODEL: vars.OPENAI_MODEL || "gpt-4.1-mini",
} as Env;
let inputTokens = 0,
  outputTokens = 0,
  completed = 0;
const originalFetch = globalThis.fetch;
globalThis.fetch = async (...args) => {
  assert.equal(String(args[0]), "https://api.openai.com/v1/responses");
  const response = await originalFetch(...args);
  const body = (await response.clone().json()) as any;
  if (!response.ok || body.status !== "completed") {
    // Error messages can echo credentials, so report only status and error code.
    console.error(
      JSON.stringify({
        status: response.status,
        code: body.error?.code ?? body.status,
      }),
    );
  } else {
    completed++;
    inputTokens += body.usage?.input_tokens ?? 0;
    outputTokens += body.usage?.output_tokens ?? 0;
  }
  return response;
};
const cases: [string, string, string][] = [
  ["我該如何註冊？", "register", "text"],
  ["這個地方要寫誰介紹的？", "code", "text"],
  ["可以給我看圖嗎？", "code", "image"],
  ["不用圖片，文字就好", "code", "text"],
  ["我已經註冊好了，接下來呢？", "kyc", "text"],
  ["我的身分驗證通過了，然後呢？", "deposit", "text"],
  ["你能解釋逐倉和全倉差在哪嗎？", "逐倉與全倉", "text"],
  ["給我看圖", "逐倉與全倉", "image"],
];
const limit = Number(
  process.argv.find((arg) => arg.startsWith("--limit="))?.split("=")[1] ??
    cases.length,
);
let context: TeachingContext | null = null;
for (const [question, topic, format] of cases.slice(0, limit)) {
  const before = completed;
  const started = Date.now();
  const route = await routeQuestion(question, context, env);
  assert.equal(
    completed,
    before + 1,
    "A real completed OpenAI response is required; fallback does not pass this test",
  );
  assert.equal(route.topic, topic, question);
  assert.equal(route.format, format, question);
  const messages = isStep(route.topic)
    ? guide(route.topic, "https://preview.invalid", route.format === "image")
    : [];
  if (topic === "code" && format === "image") {
    assert.equal(messages[0].type, "image");
    assert.ok((await readFile("public/guides/register.jpg")).length > 0);
  }
  console.log(
    JSON.stringify({
      question,
      topic: route.topic,
      format: route.format,
      messageTypes: messages.map((m) => m.type),
      elapsedMs: Date.now() - started,
    }),
  );
  context = route;
}
console.log(
  JSON.stringify({
    model: env.OPENAI_MODEL,
    completed,
    inputTokens,
    outputTokens,
    lineMessagesSent: 0,
  }),
);
