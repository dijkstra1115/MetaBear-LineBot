import { test } from "node:test";
import assert from "node:assert/strict";
import { NOTIFY_KINDS, defaultSettings, notifySupport, pickFresh } from "../public/lab/orderflow/notify.js";
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
  assert.deepEqual(defaultSettings(), { on: false, kinds: NOTIFY_KINDS.map((k) => k.id) });
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
