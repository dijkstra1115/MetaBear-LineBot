import test from "node:test";
import assert from "node:assert/strict";
import {
  CHALLENGES,
  ChallengeRun,
  FuturesBook,
} from "../public/orderflow/challenge-engine.js";

const limit = (side, price, size) => ({ side, type: "limit", price, size });
const market = (side, size) => ({ side, type: "market", size });

test("OI follows opened, closed, and transferred perpetual positions", () => {
  const x = new FuturesBook();
  for (const id of ["a", "b", "c"]) x.addAccount(id, 10000);
  x.submit("b", limit("sell", 10000, 100));
  x.submit("a", market("buy", 100));
  assert.equal(x.openInterest(), 100);
  assert.equal(x.accounts.a.position, 100);
  assert.equal(x.accounts.b.position, -100);

  x.submit("a", limit("sell", 10100, 100));
  x.submit("c", market("buy", 100));
  assert.equal(x.openInterest(), 100, "a long transferred to c; b remains short");

  x.submit("b", limit("buy", 9900, 100));
  x.submit("c", market("sell", 100));
  assert.equal(x.openInterest(), 0);
  assert.equal(x.accounts.b.position, 0);
  assert.equal(x.accounts.c.position, 0);
  assert.deepEqual(x.trades.map((t) => t.oiDelta), [100, 0, -100]);
});

test("leverage constrains new exposure and liquidation closes insolvent positions", () => {
  const x = new FuturesBook();
  x.addAccount("long", 100, 5);
  x.addAccount("short", 10000, 5);
  x.addAccount("maker", 10000, 5);
  assert.equal(x.submit("long", market("buy", 1000)).ok, false);
  x.submit("short", limit("sell", 10000, 498));
  assert.equal(x.submit("long", market("buy", 498)).filled, 498);
  assert.equal(x.openInterest(), 498);
  x.submit("short", limit("buy", 8000, 498));
  x.submit("maker", limit("sell", 8010, 100));
  x.indexPrice = 8000;
  x.updateMark();
  x.liquidate();
  assert.equal(x.accounts.long.position, 0);
  assert.equal(x.openInterest(), 0);
  assert.equal(x.liquidations.length, 1);
  assert.equal(x.liquidations[0].owner, "long");
  assert.ok(x.accounts.long.balance >= 0);
});

test("a losing position can still be closed when initial margin is impaired", () => {
  const x = new FuturesBook();
  x.addAccount("player", 100, 5);
  x.addAccount("seller", 10000, 5);
  x.addAccount("buyer", 10000, 5);
  x.submit("seller", limit("sell", 10000, 490));
  assert.equal(x.submit("player", market("buy", 490)).filled, 490);
  x.submit("buyer", limit("buy", 9500, 490));
  x.indexPrice = 7500;
  x.updateMark();
  assert.ok(x.freeCollateral("player") < 0);
  const close = x.submit("player", market("sell", 490));
  assert.equal(close.filled, 490);
  assert.equal(x.accounts.player.position, 0);
});

test("self-crossing limit orders cancel instead of resting across the spread", () => {
  const x = new FuturesBook();
  x.addAccount("player", 10000);
  x.submit("player", limit("sell", 10100, 100));
  const crossing = x.submit("player", limit("buy", 10200, 100));
  assert.equal(crossing.filled, 0);
  assert.equal(crossing.canceled, true);
  assert.equal(x.book("buy").length, 0);
  assert.equal(x.book("sell").length, 1);
});

test("scenario seeds reproduce the same orders, prices, OI, and events", () => {
  const a = new ChallengeRun("false-break", 7788);
  const b = new ChallengeRun("false-break", 7788);
  a.advance(180);
  b.advance(180);
  assert.deepEqual(a.candles, b.candles);
  assert.deepEqual(a.events, b.events);
  assert.deepEqual(a.book.trades, b.book.trades);
  assert.equal(a.book.openInterest(), b.book.openInterest());
});

test("each difficulty generates both directions and relevant market branches", () => {
  for (const challenge of CHALLENGES) {
    const profiles = Array.from({ length: 24 }, (_, index) => new ChallengeRun(challenge.id, 1001 + index).profile);
    assert.deepEqual(new Set(profiles.map((profile) => profile.polarity)), new Set([-1, 1]));
    if (challenge.id !== "first-flow") assert.equal(new Set(profiles.map((profile) => profile.branch)).size, 2);
  }
});

test("OI distinguishes new positions from closing positions in the sampled third-stage runs", () => {
  const seen = new Set();
  for (let seed = 200001; seed <= 200080; seed++) {
    const run = new ChallengeRun("covering-rally", seed);
    const { branch, pace, delay } = run.profile;
    seen.add(branch);
    const start = Math.round(55 * pace + delay);
    const end = Math.round(115 * pace + delay);
    run.advance(start);
    const before = run.book.openInterest();
    run.advance(end - start);
    const change = run.book.openInterest() - before;
    assert.ok(branch === "fresh" ? change > 0 : change < 0, `${seed}: ${branch} OI moved in the wrong direction`);
  }
  assert.deepEqual(seen, new Set(["fresh", "covering"]));
});

test("protective exits and partial reductions act on the actual position", () => {
  const run = new ChallengeRun("first-flow", 1003);
  run.advance(30);
  assert.equal(run.order("buy", "market", 10000).filled, 10000);
  assert.equal(run.reducePosition(0.25).filled, 2500);
  assert.equal(run.book.accounts.player.position, 7500);
  const mark = run.book.markPrice;
  assert.equal(run.setProtection(mark - 20, mark + 20).ok, true);
  run.book.markPrice = mark + 21;
  run.checkProtection();
  assert.equal(run.book.accounts.player.position, 0);
  assert.equal(run.protection, null);
  assert.equal(run.events[0].title, "止盈觸發");
});

test("sampled random rounds have bounded winning paths", () => {
  for (const challenge of CHALLENGES) for (let sample = 1; sample <= 12; sample++) {
    const seed = 200000 + sample;
    const profile = new ChallengeRun(challenge.id, seed).profile;
    const phases = challenge.id === "first-flow" ? [30] : challenge.id === "covering-rally" ? [65] : challenge.id === "thin-book" ? [35, 45, 55, 65, 75] : [25, 35, 45, 55, 65, 75, 85, 95];
    const offsets = challenge.id === "thin-book" && profile.branch === "trap" ? [40, 80, 120, 160, 200] : [0];
    const sizes = challenge.id === "thin-book" ? [18000] : challenge.id === "covering-rally" ? [15000] : challenge.id === "first-flow" ? [25000] : [15000, 20000, 25000];
    let possible = false;
    for (const phase of phases) {
      if (possible) break;
      for (const offset of offsets) {
        if (possible) break;
        for (const size of sizes) {
          const run = new ChallengeRun(challenge.id, seed);
          const { polarity, branch, pace, delay } = run.profile;
          const at = Math.round(phase * pace + delay);
          run.advance(at);
          const direction = (branch === "trap" && ["false-break", "thin-book"].includes(challenge.id) ? -1 : 1) * polarity;
          const side = direction === 1 ? "buy" : "sell";
          const price = offset ? run.book.lastPrice + polarity * offset : undefined;
          run.order(side, offset ? "limit" : "market", size, price);
          if (["covering-rally", "thin-book"].includes(challenge.id)) {
            const exit = Math.round((challenge.id === "thin-book" ? 160 : 115) * pace + delay);
            run.advance(Math.max(0, exit - at));
            run.closePosition();
          }
          run.advance(challenge.duration - at);
          if (run.result().pass) { possible = true; break; }
        }
      }
    }
    assert.ok(possible, `${challenge.id} seed ${seed} has no sampled winning path`);
  }
});
