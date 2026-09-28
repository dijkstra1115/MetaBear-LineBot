import { build } from "esbuild";
import { buildAcademy } from "./build-academy.mjs";
import { buildMotionPages } from "./build-motion-pages.mjs";

await buildMotionPages();
await buildAcademy();
await build({
  entryPoints: ["web/site.js"],
  outfile: "public/site.js",
  bundle: true,
  minify: true,
  format: "iife",
  target: ["es2022"],
  legalComments: "eof",
});
