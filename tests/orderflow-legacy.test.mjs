import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { fileURLToPath } from "node:url";

const root = new URL("../public/orderflow/", import.meta.url);
const read = (name) => readFileSync(new URL(name, root), "utf8");

test("archived bookmarks preserve their chapter, scene and workspace", () => {
  for (const name of ["classic", "journey", "absorption"]) {
    const html = read(`${name}.html`);
    const href = /id="legacy-target" href="([^"]+)"/.exec(html)[1];
    let destination;
    runInNewContext(read("legacy-redirect.js"), {
      URL,
      document: {
        getElementById: () => ({
          href: new URL(href, `https://example.test/orderflow/${name}.html`)
            .href,
        }),
      },
      location: {
        search: "?chapter=traces&scene=2&workspace=live",
        hash: "#scene-3",
        replace: (value) => {
          destination = value;
        },
      },
    });
    assert.equal(
      destination,
      `https://example.test/orderflow/legacy/${name}.html?chapter=traces&scene=2&workspace=live#scene-3`,
    );
  }
});

test("academy bookmarks enter the archived version without losing the requested lesson", async () => {
  for (const [search, expected] of [
    ["?classic=1&lesson=cvd", "?classic=1&lesson=cvd"],
    ["?lesson=iceberg", "?lesson=iceberg&classic=1"],
    ["?workspace=live", "?workspace=live"],
    ["?workspace=practice&lesson=wall", "?workspace=practice&lesson=wall"],
  ]) {
    let destination;
    await runInNewContext(`(async () => { ${read("academy-entry.js")} })()`, {
      URL,
      URLSearchParams,
      location: {
        href: "https://example.test/orderflow/" + search,
        search,
        hash: "#saved",
        replace: (value) => {
          destination = value;
        },
      },
    });
    assert.equal(
      destination,
      "https://example.test/orderflow/legacy/classic.html" +
        expected +
        "#saved",
    );
  }
});

test("archived course navigation stays in the fifteen-course edition", () => {
  const shell = read("legacy/lesson-shell.js");
  assert.doesNotMatch(shell, /\.\/\?lesson=|\.\/\?workspace=/);
  assert.match(shell, /classic\.html\?classic=1&lesson=/);
  assert.match(read("legacy/app.js"), /classic\.html\?classic=1&lesson=/);
});

test("current and archived pages have no missing local module or asset references", () => {
  for (const prefix of ["", "legacy/"]) {
    for (const name of readdirSync(new URL(prefix, root))) {
      if (!/\.(js|html|css)$/.test(name)) continue;
      const url = new URL(prefix + name, root);
      const source = read(prefix + name);
      const refs =
        /(?:\bfrom\s*|\bimport\s*\(?\s*|\b(?:href|src)=)["'](\.[^"'`<>$]+)["']/g;
      for (const [, ref] of source.matchAll(refs)) {
        const target = new URL(ref.replaceAll("&amp;", "&"), url);
        assert.ok(
          existsSync(fileURLToPath(target)),
          `${prefix}${name} -> ${ref}`,
        );
      }
    }
  }
});
