import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

// Exercise the real player with a controlled animation clock, without a browser timer.
const source = readFileSync(
  new URL("../public/orderflow/story-player.js", import.meta.url),
  "utf8",
).replace("export function mountStory", "function mountStory");

function player({
  continuousDesktop = true,
  mobile = false,
  desktopSceneHold = 0,
} = {}) {
  const nodes = new Map(),
    queue = new Map(),
    renders = [],
    documentEvents = {};
  let now = 0,
    id = 0;
  function element(dataset = {}) {
    const attrs = {},
      events = {};
    return {
      attrs,
      events,
      dataset,
      textContent: "",
      disabled: false,
      style: { setProperty() {} },
      classList: { toggle() {} },
      setAttribute(k, v) {
        attrs[k] = v;
      },
      removeAttribute(k) {
        delete attrs[k];
      },
      addEventListener(k, fn) {
        events[k] = fn;
      },
      scrollIntoView() {},
    };
  }
  const chapters = [0, 1, 2].map((i) => element({ storyScene: String(i) }));
  const route = [0, 1, 2].map(() => element());
  const body = element();
  const document = {
    body,
    hidden: false,
    querySelector(selector) {
      if (!nodes.has(selector)) nodes.set(selector, element());
      return nodes.get(selector);
    },
    querySelectorAll(selector) {
      return selector === "[data-story-scene]" ? chapters : route;
    },
    addEventListener(name, fn) {
      documentEvents[name] = fn;
    },
  };
  const durations = [200, 300, 400];
  runInNewContext(source + "\nmountStory(config);", {
    document,
    location: { hash: "" },
    performance: { now: () => now },
    window: { scrollY: 0, addEventListener() {} },
    matchMedia: (query) => ({
      matches: query.includes("max-width") && mobile,
      addEventListener() {},
    }),
    requestAnimationFrame(fn) {
      queue.set(++id, fn);
      return id;
    },
    cancelAnimationFrame(key) {
      queue.delete(key);
    },
    config: {
      continuousDesktop,
      desktopSceneHold,
      durations,
      scenes: durations.map((_, i) => ({
        label: `scene ${i}`,
        eyebrow: `eyebrow ${i}`,
        lens: `lens ${i}`,
      })),
      position: (scene, elapsed) => ({
        scene,
        elapsed,
        progress: elapsed / durations[scene],
        mode: String(scene),
      }),
      narrative: (scene) => ({
        headline: `headline ${scene}`,
        question: `question ${scene}`,
      }),
      render(p) {
        renders.push(p);
        return {
          svg: `scene ${p.scene}`,
          clock: "00",
          price: "100",
          description: "example",
        };
      },
      nextStory: "./wick.html",
    },
  });
  return {
    body,
    chapters,
    renders,
    node: (selector) => nodes.get(selector),
    tick(ms = 100) {
      now += ms;
      const pending = [...queue.values()];
      queue.clear();
      pending.forEach((fn) => fn(now));
    },
    click(selector) {
      nodes.get(selector).events.click();
    },
    seek(value) {
      nodes.get("#scene-progress").events.input({ currentTarget: { value } });
    },
    hide() {
      document.hidden = true;
      documentEvents.visibilitychange();
    },
  };
}

test("desktop automatically connects scenes, stops at the course ending, and replays", () => {
  const p = player();
  p.tick();
  p.tick();
  assert.equal(p.body.dataset.scene, "2");
  assert.equal(p.chapters[1].attrs["aria-current"], "step");
  for (let i = 0; i < 7; i++) p.tick();
  assert.equal(p.body.dataset.scene, "3");
  assert.equal(p.body.dataset.running, "false");
  assert.equal(p.node("#pause").textContent, "重播本課");
  assert.equal(p.node("#next").disabled, false);
  p.click("#pause");
  assert.equal(p.body.dataset.scene, "1");
  assert.equal(p.node("#scene-progress").value, 0);
  assert.equal(p.node("#back").disabled, true);
});

test("whole-course seeking restores scene, subtitle, chapter selection and pauses the clock", () => {
  const p = player();
  p.seek(650);
  assert.equal(p.body.dataset.scene, "3");
  assert.equal(p.renders.at(-1).elapsed, 150);
  assert.equal(p.node("#headline").textContent, "headline 2");
  assert.equal(p.body.dataset.paused, "true");
  p.tick();
  assert.equal(p.renders.at(-1).elapsed, 150);
  p.seek(50);
  assert.equal(p.body.dataset.scene, "1");
  assert.equal(p.renders.at(-1).elapsed, 50);
  assert.equal(p.chapters[2].attrs["aria-current"], undefined);
  assert.equal(p.node("#headline").textContent, "headline 0");
  p.click("#pause");
  p.tick();
  assert.equal(p.renders.at(-1).elapsed, 150);
});

test("chapter navigation and replay reset playback and a hidden tab pauses", () => {
  const p = player();
  p.chapters[2].events.click();
  assert.equal(p.body.dataset.scene, "3");
  assert.equal(p.node("#scene-progress").value, 500);
  p.hide();
  assert.equal(p.body.dataset.paused, "true");
  const rendered = p.renders.length;
  p.tick();
  assert.equal(p.renders.length, rendered);
  p.click("#replay");
  assert.equal(p.body.dataset.scene, "1");
  assert.equal(p.body.dataset.paused, "true");
});

test("mobile and courses without the option retain their scene-by-scene playback", () => {
  for (const options of [{ mobile: true }, { continuousDesktop: false }]) {
    const p = player(options);
    p.tick();
    p.tick();
    p.tick();
    assert.equal(p.body.dataset.scene, "1");
    assert.equal(p.body.dataset.running, "false");
    assert.equal(p.node("#scene-progress").max, 200);
    assert.equal(p.node("#pause").disabled, true);
    p.click("#next");
    assert.equal(p.body.dataset.scene, "2");
    assert.equal(p.node("#scene-progress").value, 0);
  }
});

test("caption holds remain part of the desktop timeline without changing mobile timing", () => {
  const p = player({ desktopSceneHold: 100 });
  p.tick();
  p.tick();
  assert.equal(p.body.dataset.scene, "1");
  assert.equal(p.body.dataset.running, "true");
  p.tick();
  assert.equal(p.body.dataset.scene, "2");
  assert.equal(p.node("#scene-progress").max, 1200);
  p.seek(750);
  assert.equal(p.body.dataset.scene, "3");
  assert.equal(p.renders.at(-1).elapsed, 50);
  const m = player({ desktopSceneHold: 100, mobile: true });
  m.tick();
  m.tick();
  assert.equal(m.body.dataset.scene, "1");
  assert.equal(m.body.dataset.running, "false");
  assert.equal(m.node("#scene-progress").max, 200);
});
