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
