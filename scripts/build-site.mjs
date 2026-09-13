import { build } from "esbuild";
await build({
  entryPoints: ["web/site.js"],
  outfile: "public/site.js",
  bundle: true,
  minify: true,
  format: "iife",
  target: ["es2022"],
  legalComments: "eof",
});
