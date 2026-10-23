import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { GUIDE_STEPS, shouldShowGuide } from "../public/lab/orderflow/guide.js";

test("the lab guide shows once, and never in replays or recordings", () => {
  assert.equal(shouldShowGuide({ seen: false, replay: false, rec: false }), true);
  assert.equal(shouldShowGuide({ seen: true, replay: false, rec: false }), false);
  assert.equal(shouldShowGuide({ seen: false, replay: true, rec: false }), false);
  assert.equal(shouldShowGuide({ seen: false, replay: false, rec: true }), false);
});

test("every guide step points at an element on the lab page and ends at the academy and alerts", async () => {
  const html = await readFile("public/lab/orderflow/index.html", "utf8");
  const present = {
    ".stage": /<main class="stage"/,
    '.seg[aria-label="圖表"]': /class="seg" role="group" aria-label="圖表"/,
    "details.ind": /<details class="ind"/,
    ".site-links": /<nav class="site-links"/,
  };
  for (const step of GUIDE_STEPS) assert.match(html, present[step.target] ?? /^$/, step.target);
  assert.match(html, /id="guide-open"/);
  assert.deepEqual(GUIDE_STEPS.at(-1).links.map(([href]) => href), ["/orderflow/", "/alerts/"]);
  assert.match(GUIDE_STEPS.at(-1).body, /不是買賣訊號/);
});
