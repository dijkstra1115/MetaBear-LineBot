import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { courses, isAvailable } from "../public/orderflow/academy-catalog.js";

// Minimal browser stand-ins so lesson draw functions can run in Node.
class Stub2D {
  constructor() {
    return strictContext();
  }
}
globalThis.OffscreenCanvas ??= class {
  constructor(w, h) {
    this.width = w;
    this.height = h;
  }
  getContext() {
    return new Stub2D();
  }
};
globalThis.Path2D ??= class {};

/** A canvas context that rejects non-finite numeric arguments. */
function strictContext() {
  const calls = { n: 0 };
  const special = {
    measureText: (s) => ({ width: String(s).length * 10 }),
    createLinearGradient: () => ({ addColorStop() {} }),
    createRadialGradient: () => ({ addColorStop() {} }),
    getImageData: () => ({ data: [] }),
    createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }),
  };
  return new Proxy(
    { calls },
    {
      get(target, prop) {
        if (prop === "calls") return calls;
        if (prop in target) return target[prop];
        return (...args) => {
          calls.n++;
          for (const a of args)
            if (typeof a === "number" && !Number.isFinite(a))
              throw new Error(`non-finite argument to ${String(prop)}: ${args.join(", ")}`);
          return special[prop]?.(...args);
        };
      },
      set(target, prop, value) {
        target[prop] = value;
        return true;
      },
    },
  );
}

const motion = courses.filter((c) => c.format === "motion" && isAvailable(c));
const read = (f) => readFileSync(new URL("../public/orderflow/" + f, import.meta.url), "utf8");

test("every available course is a motion lesson with matching metadata", async () => {
  assert.equal(motion.length, courses.filter(isAvailable).length);
  for (const c of motion) {
    const file = new URL(`../public/orderflow/motion/lessons/${c.id}.js`, import.meta.url);
    assert.ok(existsSync(file), c.id);
    const { lesson } = await import(file.href);
    assert.equal(lesson.id, c.id);
    assert.equal(lesson.duration, c.duration, `${c.id} duration`);
    assert.ok(existsSync(new URL(`../public/orderflow/motion/audio/${c.id}.m4a`, import.meta.url)), `${c.id} audio`);
  }
});

test("chapters, captions and cues stay inside each lesson's timeline", async () => {
  for (const c of motion) {
    const { lesson } = await import(`../public/orderflow/motion/lessons/${c.id}.js`);
    const D = lesson.duration;
    assert.equal(lesson.chapters[0].t, 0, c.id);
    lesson.chapters.forEach((ch, i) => {
      assert.ok(ch.label.length > 0);
      assert.ok(ch.t < D, `${c.id} chapter ${i}`);
      if (i) assert.ok(ch.t > lesson.chapters[i - 1].t, `${c.id} chapter order ${i}`);
    });
    let prevEnd = 0;
    for (const cap of lesson.captions) {
      assert.ok(cap.a < cap.b && cap.a >= 0 && cap.b <= D, `${c.id} caption ${cap.text}`);
      assert.ok(cap.a >= prevEnd - 1e-9, `${c.id} captions overlap at ${cap.text}`);
      prevEnd = cap.b;
    }
    for (const cue of lesson.cues)
      assert.ok(cue.t >= 0 && cue.t <= D + 0.5 && Number.isFinite(cue.t), `${c.id} cue ${cue.kind}`);
  }
});

test("every frame of every lesson draws with finite geometry, in both motion modes", async () => {
  const { prefs } = await import("../public/orderflow/motion/core.js");
  for (const reduced of [false, true]) {
    prefs.reduced = reduced;
    for (const c of motion) {
      const { lesson } = await import(`../public/orderflow/motion/lessons/${c.id}.js`);
      for (let t = 0; t <= lesson.duration + 1e-9; t += 0.1) {
        const ctx = strictContext();
        lesson.draw(ctx, t);
        assert.ok(ctx.calls.n > 0 || t < 0.05, `${c.id} drew nothing at ${t}`);
      }
    }
  }
  prefs.reduced = false;
});

test("drawing is a pure function of time (scrubbing backwards repeats the same frame)", async () => {
  for (const c of motion) {
    const { lesson } = await import(`../public/orderflow/motion/lessons/${c.id}.js`);
    const count = (t) => {
      const ctx = strictContext();
      lesson.draw(ctx, t);
      return ctx.calls.n;
    };
    const mid = lesson.duration * 0.6;
    const first = count(mid);
    count(lesson.duration);
    count(0.5);
    assert.equal(count(mid), first, c.id);
  }
});

test("generated pages mount the player and list every chapter", async () => {
  for (const c of motion) {
    const { lesson } = await import(`../public/orderflow/motion/lessons/${c.id}.js`);
    const html = read(c.href.slice(2));
    assert.match(html, new RegExp(`class="motion-player"[\\s\\S]*data-lesson="${c.id}"`));
    assert.match(html, /src="\.\/motion\/boot\.js"/);
    assert.equal([...html.matchAll(/data-story-scene="\d+"/g)].length, lesson.chapters.length, c.id);
    assert.doesNotMatch(html, /<style|\sstyle="/, `${c.id} must stay CSP-safe`);
  }
});

test("the support-resistance ledger matches its lesson plan", async () => {
  const m = await import("../public/orderflow/motion/lessons/support-resistance.js");
  const bar = (trades, i) => {
    const fp = m.footprint(trades, i);
    const ts = trades.filter((x) => x.bar === i);
    const sell = Object.values(fp).reduce((s, c) => s + c.bid, 0);
    const buy = Object.values(fp).reduce((s, c) => s + c.ask, 0);
    const ps = ts.map((x) => x.price);
    return { o: ps[0], h: Math.max(...ps), l: Math.min(...ps), c: ps.at(-1), v: buy + sell, d: buy - sell, oi: ts.reduce((s, x) => s + x.oi, 0), fp };
  };
  // the range: every finished bar's volume sits inside its own high/low; HVN above, LVN below
  for (const b of m.HIST) {
    const ps = Object.keys(b.at).map(Number);
    assert.deepEqual([Math.min(...ps), Math.max(...ps)], [b.l, b.h]);
  }
  assert.equal(m.HIST.reduce((s, b) => s + b.v, 0), 1028);
  assert.equal(m.RANGE_POC, 102);
  for (let p = 95; p <= 99; p++) assert.ok(m.RANGE[p] < m.RANGE[101] / 10, `LVN ${p}`);
  // A: 380 absorbed at 101, the retest sells only 20, two stacked buy imbalances
  const a13 = bar(m.TRADES_A, 13);
  assert.deepEqual([a13.o, a13.h, a13.l, a13.c, a13.v, a13.d, a13.oi], [103, 103, 101, 102, 540, -380, 40]);
  assert.equal(a13.fp[101].bid, 380);
  assert.equal(m.bookAt(m.BOOK_A, m.TRADES_A, 31).bid[101], 170);
  const a14 = bar(m.TRADES_A, 14);
  assert.deepEqual([a14.o, a14.h, a14.l, a14.c, a14.v, a14.d], [102, 103, 101, 103, 215, 145]);
  assert.equal(a14.fp[101].bid, 20);
  assert.equal(a14.fp[102].ask / a14.fp[101].bid, 4);
  assert.equal(a14.fp[103].ask / a14.fp[102].bid, 6);
  // B: bids pulled before the touch, break through the LVN, accepted below, retest absorbed
  const pre = m.bookAt(m.BOOK_B, m.TRADES_B, 60);
  assert.deepEqual([pre.bid[101], pre.bid[100]], [70, 50]);
  const b13 = bar(m.TRADES_B, 13);
  assert.deepEqual([b13.o, b13.h, b13.l, b13.c, b13.v, b13.d, b13.oi], [103, 103, 96, 97, 720, -480, -120]);
  const accepted = m.acceptedProfile();
  assert.equal(Object.values(accepted).reduce((s, q) => s + q, 0), 560);
  assert.deepEqual(m.ACCEPT_B.map((b) => b.oi), [120, 80]);
  m.ACCEPT_B.forEach((b) => assert.equal(Object.values(b.at).reduce((s, q) => s + q, 0), b.v));
  const b16 = bar(m.TRADES_B, 16);
  assert.deepEqual([b16.o, b16.h, b16.l, b16.c, b16.v, b16.d], [98, 100, 98, 99, 330, 170]);
  assert.equal(b16.fp[100].ask, 150);
  assert.equal(m.bookAt(m.BOOK_B, m.TRADES_B, 74).ask[100], 150);
  const b17 = bar(m.TRADES_B, 17);
  assert.deepEqual([b17.o, b17.h, b17.l, b17.c, b17.v, b17.d], [99, 100, 97, 97, 280, -150]);
  assert.equal(b17.fp[99].bid / b17.fp[100].ask, 4);
  assert.equal(b17.fp[98].bid / b17.fp[99].ask, 6);
  assert.ok(b17.fp[97].bid / b17.fp[98].ask < 3);
  // plans: 1R first targets on both sides
  assert.equal((m.PLAN_A.t1 - m.PLAN_A.entry) / (m.PLAN_A.entry - m.PLAN_A.stop), 1);
  assert.equal((m.PLAN_B.entry - m.PLAN_B.t1) / (m.PLAN_B.stop - m.PLAN_B.entry), 1);
});

test("the trend-pullback ledger matches its lesson plan", async () => {
  const m = await import("../public/orderflow/motion/lessons/trend-pullback.js");
  const bar = (trades, i) => {
    const fp = m.footprint(trades, i);
    const ts = trades.filter((x) => x.bar === i);
    const sell = Object.values(fp).reduce((s, c) => s + c.bid, 0);
    const buy = Object.values(fp).reduce((s, c) => s + c.ask, 0);
    const ps = ts.map((x) => x.price);
    return { o: ps[0], h: Math.max(...ps), l: Math.min(...ps), c: ps.at(-1), v: buy + sell, d: buy - sell, oi: ts.reduce((s, x) => s + x.oi, 0), fp };
  };
  const sum = (xs) => xs.reduce((s, x) => s + x, 0);
  // the impulse: heavy volume, new longs; its POC is not a prior swing level
  for (const b of m.HIST.filter((b) => b.at)) {
    const ps = Object.keys(b.at).map(Number);
    assert.deepEqual([Math.min(...ps), Math.max(...ps)], [b.l, b.h]);
  }
  assert.equal(m.POC, 106);
  assert.ok(m.HIST.slice(0, 7).every((b) => b.h !== m.POC && b.l !== m.POC));
  assert.equal(sum(Object.values(m.impulseProfile())), 840);
  assert.equal(m.IMPULSE_AVG, 240);
  assert.equal(m.IMPULSE_DELTA, 390);
  assert.equal(m.CVD_START, 140);
  const cvdTop = sum(m.HIST.map((b) => b.d));
  const oiTop = m.OI0 + sum(m.HIST.map((b) => b.oi));
  assert.deepEqual([cvdTop, oiTop], [510, 1310]);
  // A: quiet pullback with falling highs, then the first positive delta and a break of the last high
  assert.ok(m.PULL_A.every((b) => b.v < m.IMPULSE_AVG / 2));
  assert.deepEqual([m.HIST[10].h, ...m.PULL_A.map((b) => b.h)], [110, 109, 108]);
  assert.equal(m.TRIGGER, 108);
  const pullA = m.HIST[10].d + sum(m.PULL_A.map((b) => b.d));
  assert.equal(pullA, -90);
  assert.ok(-pullA < m.IMPULSE_DELTA / 2);
  assert.equal(sum(m.PULL_A.map((b) => b.oi)), -40);
  const a13 = bar(m.TRADES_A, 13);
  assert.deepEqual([a13.o, a13.h, a13.l, a13.c, a13.v, a13.d], [106, 107, 105, 107, 180, 80]);
  assert.ok(a13.h < m.TRIGGER);
  const a14 = bar(m.TRADES_A, 14);
  assert.deepEqual([a14.o, a14.h, a14.l, a14.c, a14.v, a14.d], [107, 109, 107, 109, 140, 120]);
  const brk = m.TRADES_A.find((x) => x.bar === 14 && x.price >= m.TRIGGER);
  assert.ok(brk.t <= m.PLAN.entryT && m.PLAN.entryT - brk.t < 0.1);
  assert.equal(m.PLAN.stop, a13.l - 1);
  assert.equal((m.PLAN.t1 - m.PLAN.entry) / (m.PLAN.entry - m.PLAN.stop), 1);
  assert.equal((m.PLAN.t2 - m.PLAN.entry) / (m.PLAN.entry - m.PLAN.stop), 1.75);
  assert.ok(m.RALLY_A[0].h >= m.PLAN.t1);
  // B: loud pullback, CVD below the impulse start, new shorts, never a positive delta
  assert.ok(m.PULL_B.at(-1).v > m.PULL_B[0].v);
  const b13 = bar(m.TRADES_B, 13);
  assert.deepEqual([b13.o, b13.h, b13.l, b13.c, b13.v, b13.d, b13.oi], [105, 105, 102, 103, 270, -170, 80]);
  assert.ok([...m.PULL_B.map((b) => b.d), b13.d].every((d) => d < 0));
  const pullB = m.HIST[10].d + sum(m.PULL_B.map((b) => b.d)) + b13.d;
  assert.equal(pullB, -500);
  assert.equal(cvdTop + pullB - m.HIST[10].d, 30);
  assert.ok(cvdTop + pullB - m.HIST[10].d < m.CVD_START);
  assert.equal(sum(m.PULL_B.map((b) => b.oi)) + b13.oi, 240);
});

test("the fibonacci story's ledger matches its lesson plan", async () => {
  const m = await import("../public/orderflow/motion/lessons/fibonacci.js");
  const sum = (xs) => xs.reduce((s, x) => s + x, 0);
  assert.deepEqual(m.LEVELS.map((r) => Math.round(m.fibPrice(r))), [1764, 1618, 1500, 1382, 1214]);
  assert.deepEqual([Math.round(m.POCKET.top), Math.round(m.POCKET.bottom)], [1382, 1350]);
  // 200 simulated pullbacks: one smooth hump, most of them between 15% and 65%
  assert.equal(sum(m.DEPTHS), 200);
  assert.equal(m.depthShare(15, 65), 171);
  const peak = m.DEPTHS.indexOf(Math.max(...m.DEPTHS));
  m.DEPTHS.forEach((n, i) => i > 0 && assert.ok(i <= peak ? n >= m.DEPTHS[i - 1] : n <= m.DEPTHS[i - 1], `bin ${i}`));
  // the crowd: 600 bid in the pocket, 400 long stops under 0.786
  const crowd = (book, t) => {
    const q = {};
    for (const e of [...book].sort((a, b) => a.t - b.t)) if (e.t <= t) q[e.p] = Math.max(0, (q[e.p] ?? 0) + e.q);
    return q;
  };
  const before = crowd(m.BOOK_A, 31);
  assert.equal(before[1382] + before[1370] + before[1355], 600);
  assert.ok(m.STOPS.p < m.fibPrice(0.786));
  assert.equal(m.STOPS.q, 400);
  // A: 350 absorbed, low inside the pocket, never reaches the stops
  const lowA = Math.min(...m.BARS_A.flat().map(([, p]) => p));
  assert.equal(lowA, 1355);
  assert.ok(lowA <= m.POCKET.top && lowA >= m.POCKET.bottom);
  const afterA = crowd(m.BOOK_A, 40);
  assert.equal(600 - (afterA[1382] + afterA[1370] + afterA[1355]), 350);
  // B: 480 pulled before the touch, the rest eaten, price runs through the stops to 1,150
  const pulled = crowd(m.BOOK_B, 49);
  assert.equal(pulled[1382] + pulled[1370] + pulled[1355], 120);
  const afterB = crowd(m.BOOK_B, 52);
  assert.equal(afterB[1382] + afterB[1370] + afterB[1355], 0);
  const lowB = Math.min(...m.BARS_B.flat().map(([, p]) => p));
  assert.equal(lowB, 1150);
  assert.ok(m.BARS_B[5].some(([t, p]) => t === m.STOPS.t && p <= m.fibPrice(0.786)));
});
