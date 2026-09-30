import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { runInNewContext } from "node:vm";
import {
  courses,
  paths,
  courseById,
  selectCourses,
  isAvailable,
} from "../public/orderflow/academy-catalog.js";
import {
  renderCard,
  renderSections,
  renderLessonNavigation,
  renderPrerequisites,
} from "../public/orderflow/academy-map-render.js";

test("built maps and lesson sidebars have valid local destinations and one active course", () => {
  const root = new URL("../public/orderflow/", import.meta.url);
  for (const file of [
    "index.html",
    "courses.html",
    ...courses.filter(isAvailable).map((c) => c.href),
  ]) {
    const page = new URL(file, root);
    const html = readFileSync(page, "utf8");
    for (const [, target] of html.matchAll(
      /(?:href|src)="(\.\/[^"?#]+)(?:[^\"]*)"/g,
    )) {
      assert.ok(existsSync(new URL(target, page)), `${file}: ${target}`);
    }
    if (html.includes('class="course-menu"')) {
      assert.equal([...html.matchAll(/aria-current="page"/g)].length, 1, file);
      assert.equal([...html.matchAll(/class="chapter-menu"/g)].length, 1, file);
      assert.equal(
        [...html.matchAll(/src="\.\/academy-navigation.js"/g)].length,
        1,
        file,
      );
      assert.match(html, /href="\.\/courses.html"/, file);
    }
    if (file === "index.html" || file === "courses.html") {
      assert.equal(
        [...html.matchAll(/data-course-id=/g)].length,
        courses.filter(isAvailable).length,
      );
    }
  }
});

test("the curriculum has unique ids, existing available pages and an acyclic prerequisite graph", () => {
  assert.equal(new Set(courses.map((c) => c.id)).size, courses.length);
  function visit(id, chain = []) {
    assert.ok(
      !chain.includes(id),
      `Prerequisite cycle: ${[...chain, id].join(" -> ")}`,
    );
    const course = courseById(id);
    assert.ok(course, `Unknown prerequisite ${id}`);
    course.prerequisites.forEach((next) => visit(next, [...chain, id]));
  }
  for (const course of courses) {
    visit(course.id);
    if (isAvailable(course)) {
      assert.ok(
        existsSync(
          new URL(
            `../public/orderflow/${course.href.slice(2)}`,
            import.meta.url,
          ),
        ),
        course.id,
      );
      assert.ok(course.duration > 0);
    } else assert.equal(course.href, undefined);
  }
  for (const path of paths) path.ids.forEach((id) => assert.ok(courseById(id)));
});

test("available, new, planned and route filtering work together without exposing unbuilt links", () => {
  assert.equal(selectCourses().length, 20);
  assert.equal(selectCourses({ view: "new" }).length, 8);
  assert.equal(selectCourses({ view: "all" }).length, 20);
  assert.equal(
    selectCourses({ view: "all", query: "訂單塊" })[0].id,
    "order-block",
  );
  assert.equal(selectCourses({ query: "訂單塊" }).length, 1);
  assert.deepEqual(
    selectCourses({ view: "all", path: "risk" }).map((c) => c.id),
    paths[2].ids,
  );
  for (const course of courses.filter((c) => !isAvailable(c)))
    assert.doesNotMatch(renderCard(course), /href=/);
  // Keep planned-card coverage even when every current lesson is available.
  assert.doesNotMatch(
    renderCard({
      ...courseById("order-block"),
      status: "planned",
      href: undefined,
    }),
    /href=/,
  );
  assert.match(renderSections([]), /data-reset-filter/);
});

test("lesson navigation selects only its own course and keeps its chapter controls", () => {
  const chapters =
    '<nav class="chapter-menu"><button data-story-scene="0">第一幕</button></nav>';
  const nav = renderLessonNavigation("leverage", chapters);
  assert.equal([...nav.matchAll(/aria-current="page"/g)].length, 1);
  assert.equal([...nav.matchAll(/data-story-scene="0"/g)].length, 1);
  assert.match(nav, /href="\.\/leverage.html" class="course-current"/);
  assert.doesNotMatch(nav, /href="[^\"]*(?:delta\.html|mark-price\.html)/);
  assert.doesNotMatch(nav, /href="\.\/accumulation.html"/);
  assert.doesNotMatch(nav, /href="\.\/(?:breakout|withdrawal).html"/);
  assert.match(nav, /href="\.\/absorption-story.html"/);
  assert.match(nav, /href="\.\/order-block.html"/);
  assert.match(renderPrerequisites("liquidation"), /href="\.\/leverage.html"/);
});

test("old academy scene bookmarks still reach the original lesson, and named lessons retain the scene", async () => {
  const source = readFileSync(
    new URL("../public/orderflow/academy-entry.js", import.meta.url),
    "utf8",
  );
  for (const [search, hash, expected] of [
    ["", "#scene-3", "./matching.html#scene-3"],
    ["?lesson=leverage", "#scene-2", "./leverage.html#scene-2"],
    ["?lesson=matching", "", "./matching.html"],
    ["?lesson=delta", "#scene-3", "./courses.html"],
    ["?lesson=cvd", "#scene-8", "./courses.html"],
    ["?lesson=mark-price", "#scene-2", "./courses.html"],
    ["?lesson=profile", "#scene-2", "./volume-profile.html#scene-2"],
    ["?lesson=funding", "#scene-3", "./funding.html#scene-3"],
    ["?lesson=breakout-volume", "#scene-2", "./breakout-volume.html#scene-2"],
    ["?lesson=breakout", "#scene-3", "./absorption-story.html"],
    ["?lesson=withdrawal", "#scene-2", "./absorption-story.html"],
    ["?lesson=accumulation", "#scene-3", "./courses.html"],
    ["?lesson=order-block", "#scene-2", "./order-block.html#scene-2"],
  ]) {
    let actual;
    await runInNewContext(`(async () => { ${source} })()`, {
      URL,
      URLSearchParams,
      location: {
        href: `https://example.test/orderflow/${search}${hash}`,
        search,
        hash,
        replace: (url) => {
          actual = url;
        },
      },
    });
    assert.equal(actual, expected);
  }
});
