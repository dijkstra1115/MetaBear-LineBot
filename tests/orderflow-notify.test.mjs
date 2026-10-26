import { test } from "node:test";
import assert from "node:assert/strict";
import { LINE_DAILY_MAX, NOTIFY_KINDS, defaultSettings, kindStats, lineKeyword, lineUrl, notifySupport, pickFresh, readSettings } from "../public/lab/orderflow/notify.js";
import { BAR_KINDS } from "../public/lab/orderflow/watch.js";

const ev = (t, kind, extra = {}) => ({ t, kind, price: 80_000, side: "buy", level: "pdh", dist: 20, repeat: false, text: kind, ...extra });

test("only new events of the chosen types reach the viewer, and history is never replayed", () => {
  const seen = new Set();
  const settings = { on: true, kinds: ["sweep", "wall"] };
  // The first poll only learns what has already happened.
  assert.deepEqual(pickFresh([ev(1, "sweep")], seen, { ...settings, on: false }), []);
  const fresh = pickFresh([ev(1, "sweep"), ev(2, "sweep"), ev(3, "print"), ev(4, "wall_pulled"), ev(5, "sweep", { repeat: true })], seen, settings);
  assert.deepEqual(
    fresh.map((e) => e.t),
    [2, 4],
    "a seen event, an unchosen type and a repeat at the same level are skipped; wall_pulled counts as a wall",
  );
  assert.deepEqual(pickFresh([ev(2, "sweep"), ev(4, "wall_pulled")], seen, settings), [], "nothing twice");
  // Switched off, events are still marked seen, so switching on later starts from now.
  assert.deepEqual(pickFresh([ev(6, "sweep")], seen, { ...settings, on: false }), []);
  assert.deepEqual(pickFresh([ev(6, "sweep")], seen, settings), []);
});

test("every event kind the collector records can be chosen, and all are chosen by default", () => {
  const covered = new Set(NOTIFY_KINDS.flatMap((k) => k.kinds ?? [k.id]));
  for (const kind of [...BAR_KINDS, "print", "liq", "oi", "wall", "wall_eaten", "wall_pulled", "spoof", "iceberg"]) assert.ok(covered.has(kind), kind);
  assert.deepEqual(defaultSettings(), { on: false, kinds: NOTIFY_KINDS.map((k) => k.id), daily: LINE_DAILY_MAX, quiet: "", markets: ["btc"] });
  for (const k of NOTIFY_KINDS) assert.match(k.lesson, /^[a-z-]+$/, `${k.id} links a lesson`);
});

test("browsers without system notifications are told why", () => {
  const nav = (ua) => ({ userAgent: ua });
  const win = (permission) => (permission ? { Notification: { permission } } : {});
  assert.equal(notifySupport(nav("Mozilla/5.0 (iPhone) AppleWebKit Line/14.0.0"), win("default")), "line");
  assert.equal(notifySupport(nav("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0) Safari"), win()), "ios-home");
  assert.equal(notifySupport(nav("Mozilla/5.0 (X11) Firefox"), win()), "none");
  assert.equal(notifySupport(nav("Mozilla/5.0 Chrome"), win("denied")), "denied");
  assert.equal(notifySupport(nav("Mozilla/5.0 Chrome"), win("granted")), "system");
});

test("stored settings keep only valid values", () => {
  assert.deepEqual(readSettings(null), defaultSettings());
  assert.deepEqual(readSettings({ on: true, kinds: ["sweep", "gone", "absorption"], daily: 9, quiet: "01-02", markets: ["eth", "doge", "btc"] }), {
    on: true,
    kinds: ["absorption", "sweep"],
    daily: LINE_DAILY_MAX,
    quiet: "",
    markets: ["btc", "eth"],
  });
  assert.deepEqual(readSettings({ on: "yes", daily: 2, quiet: "23-08" }), { ...defaultSettings(), daily: 2, quiet: "23-08" });
});

test("the LINE keyword follows format A and opens the official account with it typed in", () => {
  const all = NOTIFY_KINDS.map((k) => k.id);
  assert.equal(lineKeyword({ kinds: all, daily: 3, quiet: "" }), "訂閱警報 全部 每天3則");
  assert.equal(lineKeyword({ kinds: ["divergence", "absorption", "wall"], daily: 2, quiet: "00-08" }), "訂閱警報 吸收,CVD背離,掛單牆 每天2則 安靜00-08");
  assert.equal(lineKeyword({ kinds: all, daily: 3, quiet: "", markets: ["btc"] }), "訂閱警報 全部 每天3則", "BTC alone reads as before ETH");
  assert.equal(lineKeyword({ kinds: all, daily: 3, quiet: "", markets: ["btc", "eth"] }), "訂閱警報 BTC,ETH 全部 每天3則");
  assert.equal(lineKeyword({ kinds: ["sweep"], daily: 1, quiet: "", markets: ["eth"] }), "訂閱警報 ETH 掃蕩收回 每天1則");
  const url = new URL(lineUrl("訂閱警報 全部 每天3則"));
  assert.equal(url.origin + url.pathname, "https://line.me/R/oaMessage/%40804bmpkh/");
  assert.equal(decodeURIComponent(url.search.slice(1)), "訂閱警報 全部 每天3則");
});

test("card stats count the last week per type and wait for three days of feed", () => {
  const now = Date.parse("2026-11-01T00:00:00Z");
  const day = 86_400_000;
  const short = kindStats([ev(now - day, "sweep"), ev(now - 2 * 3_600_000, "wall_eaten")], now);
  assert.equal(short.sweep.count, 1);
  assert.equal(short.sweep.avg, null, "one day of feed is too short for a rate");
  assert.equal(short.wall.last.kind, "wall_eaten");
  const long = kindStats([ev(now - 20 * day, "sweep"), ev(now - 6 * day, "sweep"), ev(now - day, "sweep"), ev(now - day, "print")], now);
  assert.equal(long.sweep.count, 2, "only the last 7 days count");
  assert.equal(long.sweep.avg, 2 / 7);
  assert.equal(long.iceberg.avg, 0);
  assert.equal(long.iceberg.last, null);
});

test("the bot reads the keyword back, including what people type by hand", async () => {
  const { parseLineKeyword, inQuiet, kindNames, choiceOf, lineKeyword } = await import("../public/lab/orderflow/notify.js");
  const all = NOTIFY_KINDS.map((k) => k.id);
  for (const settings of [
    { kinds: all, daily: 3, quiet: "", markets: ["btc"] },
    { kinds: ["absorption", "divergence", "wall"], daily: 1, quiet: "23-08", markets: ["btc"] },
    { kinds: all, daily: 2, quiet: "", markets: ["btc", "eth"] },
    { kinds: ["sweep"], daily: 3, quiet: "00-08", markets: ["eth"] },
  ])
    assert.deepEqual(parseLineKeyword(lineKeyword(settings)), { ok: true, settings });
  assert.deepEqual(parseLineKeyword("訂閱警報"), { ok: true, settings: { kinds: all, daily: 3, quiet: "", markets: ["btc"] } });
  assert.deepEqual(parseLineKeyword("訂閱警報　吸收，冰山 每天2則").settings, { kinds: ["absorption", "iceberg"], daily: 2, quiet: "", markets: ["btc"] });
  assert.deepEqual(parseLineKeyword("訂閱警報 eth、Btc 全部").settings.markets, ["btc", "eth"], "coins in any case and order");
  assert.equal(parseLineKeyword("訂閱警報 DOGE").ok, false);
  assert.equal(parseLineKeyword("訂閱警報 每天9則").ok, false);
  assert.equal(parseLineKeyword("訂閱警報 安靜01-02").ok, false);
  assert.equal(parseLineKeyword("訂閱警報 火箭").ok, false);
  assert.equal(parseLineKeyword("訂閱通知"), null);
  assert.equal(parseLineKeyword("訂閱警報器"), null);
  assert.equal(inQuiet("23-08", 23), true);
  assert.equal(inQuiet("23-08", 7), true);
  assert.equal(inQuiet("23-08", 8), false);
  assert.equal(inQuiet("00-08", 0), true);
  assert.equal(inQuiet("00-08", 12), false);
  assert.equal(inQuiet("", 3), false);
  assert.equal(kindNames(all), "全部");
  assert.equal(kindNames(["sweep", "absorption"]), "吸收、掃蕩收回");
  const { marketNames } = await import("../public/lab/orderflow/notify.js");
  assert.equal(marketNames(["eth", "btc"]), "BTC、ETH");
  assert.equal(choiceOf("wall_eaten"), "wall");
  assert.equal(choiceOf("test"), undefined);
});
