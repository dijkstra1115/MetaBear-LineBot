import { rm } from "node:fs/promises";
import { build } from "esbuild";
import { buildAcademy } from "./build-academy.mjs";
import { buildMotionPages } from "./build-motion-pages.mjs";

await buildMotionPages();
await buildAcademy();
// Homepage: ES modules with code splitting so Three.js loads as its own chunk.
await rm("public/js", { recursive: true, force: true });
await build({
  entryPoints: ["web/site.js"],
  outdir: "public/js",
  bundle: true,
  splitting: true,
  minify: true,
  format: "esm",
  target: ["es2022"],
  chunkNames: "chunk-[hash]",
  // Academy modules are served as-is and imported at runtime.
  external: ["/orderflow/*"],
  legalComments: "eof",
});
