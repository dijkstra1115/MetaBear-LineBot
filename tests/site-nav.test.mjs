import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const navLinks = (html) => {
  const nav = html.match(/<nav class="mb-nav"[^>]*>([\s\S]*?)<\/nav>/)?.[1] ?? "";
  return [...nav.matchAll(/<a[^>]*href="([^"]+)"[^>]*>/g)].map((m) => m[1]);
};

test("home, academy and alerts share one header nav that marks the current page", async () => {
  const pages = {
    "public/index.html": "/",
    "public/orderflow/courses.html": "/orderflow/",
    "public/orderflow/index.html": "/orderflow/",
    "public/alerts/index.html": "/alerts/",
    "public/guide.html": "/learn",
  };
  for (const [file, current] of Object.entries(pages)) {
    const html = await readFile(file, "utf8");
    // The homepage links FLOW ARENA to its own section.
    const links = navLinks(html).map((href) => (href === "#arena" ? "/arena/" : href));
    assert.deepEqual(links, ["/lab/orderflow/", "/alerts/", "/orderflow/", "/arena/", "/learn", "https://lin.ee/cbyuRJv"], file);
    const marked = html.match(/<nav class="mb-nav"[\s\S]*?<\/nav>/)[0].match(/href="([^"]+)" aria-current="page"/)?.[1];
    assert.equal(marked, current === "/" ? undefined : current, file);
  }
});

test("the live order-flow page links to the academy and alerts", async () => {
  const html = await readFile("public/lab/orderflow/index.html", "utf8");
  const links = html.match(/<nav class="site-links"[^>]*>([\s\S]*?)<\/nav>/)?.[1] ?? "";
  assert.match(links, /href="\/orderflow\/"/);
  assert.match(links, /href="\/alerts\/"/);
});

test("every lesson page ends with links to the live order flow and alerts", async () => {
  const { courses, isAvailable } = await import("../public/orderflow/academy-catalog.js");
  const lessons = courses.filter((c) => c.format === "motion" && isAvailable(c));
  assert.ok(lessons.length > 0);
  for (const course of lessons) {
    const html = await readFile("public/orderflow/" + course.href.slice(2), "utf8");
    const block = html.match(/<section class="lesson-live"[\s\S]*?<\/section>/)?.[0] ?? "";
    assert.match(block, /href="\/lab\/orderflow\/"/, course.id);
    assert.match(block, /href="\/alerts\/"/, course.id);
  }
});

test("FLOW ARENA links out to the live order flow, alerts and academy", async () => {
  const html = await readFile("public/arena/index.html", "utf8");
  const links = html.match(/<nav class="back-links"[^>]*>([\s\S]*?)<\/nav>/)?.[1] ?? "";
  for (const href of ["/lab/orderflow/", "/alerts/", "/orderflow/"]) assert.ok(links.includes(`href="${href}"`), href);
});

test("the homepage has an alerts section that leads to /alerts/", async () => {
  const html = await readFile("public/index.html", "utf8");
  const section = html.match(/<section[^>]*id="alerts"[\s\S]*?<\/section>/)?.[0] ?? "";
  assert.match(section, /href="\/alerts\/"/);
  assert.match(section, /不是買賣訊號/);
});
