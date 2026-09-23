import { build } from "esbuild";
import { readFile, writeFile } from "node:fs/promises";

// Keep the academy entry identical to the first story, with legacy-link routing.
const primer = await readFile("public/orderflow/matching.html", "utf8");
await writeFile(
  "public/orderflow/index.html",
  primer.replace("./primer.js", "./academy-entry.js"),
);
await build({
  entryPoints: ["web/site.js"],
  outfile: "public/site.js",
  bundle: true,
  minify: true,
  format: "iife",
  target: ["es2022"],
  legalComments: "eof",
});
