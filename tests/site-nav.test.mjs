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

test("the homepage has an alerts section that leads to /alerts/", async () => {
  const html = await readFile("public/index.html", "utf8");
  const section = html.match(/<section[^>]*id="alerts"[\s\S]*?<\/section>/)?.[0] ?? "";
  assert.match(section, /href="\/alerts\/"/);
  assert.match(section, /不是買賣訊號/);
});
