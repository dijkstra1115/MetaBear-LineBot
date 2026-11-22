// The backend and order-flow Workers bundle modules from public/ (LINE keywords, markets, the arena
// engine, the collectors' parsers). Pages publishes public/ on every push to main, but the Workers
// deploy by hand, so the site can run newer shared code than they do. Each deploy records a
// fingerprint of the public/ files it bundled; `check` compares the live ones with this checkout.
//
//   node scripts/shared-modules.mjs deploy backend|orderflow   deploy with the fingerprint
//   node scripts/shared-modules.mjs check                      which Worker is behind (exit 1)
import { build } from "esbuild";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
export const WORKERS = {
  backend: {
    entry: "src/backend.ts",
    args: ["--env", "production"],
    live: "https://metabear.io/health",
  },
  orderflow: {
    entry: "src/orderflow/index.ts",
    args: ["-c", "wrangler.orderflow.jsonc"],
    live: "https://metabear.io/api/orderflow/version",
  },
};

/** The public/ files a Worker entry bundles and a hash of their contents (line endings ignored). */
export async function fingerprint(entry) {
  const result = await build({
    absWorkingDir: root,
    entryPoints: [entry],
    bundle: true,
    write: false,
    metafile: true,
    format: "esm",
    platform: "neutral",
    target: "es2022",
    external: ["cloudflare:*", "node:*"],
    logLevel: "silent",
  });
  const files = Object.keys(result.metafile.inputs)
    .map((file) => file.replaceAll("\\", "/"))
    .filter((file) => file.startsWith("public/"))
    .sort();
  const hash = createHash("sha256");
  for (const file of files)
    hash.update(file + "\0" + readFileSync(root + file, "utf8").replaceAll("\r\n", "\n") + "\0");
  return { files, hash: hash.digest("hex").slice(0, 16) };
}

async function deploy(name) {
  const worker = WORKERS[name];
  if (!worker) throw new Error(`Unknown Worker ${name}; use ${Object.keys(WORKERS).join(" or ")}`);
  const { hash, files } = await fingerprint(worker.entry);
  console.log(`Shared public/ modules: ${files.length} files, fingerprint ${hash}`);
  const wrangler = root + "node_modules/wrangler/bin/wrangler.js";
  const run = spawnSync(process.execPath, [wrangler, "deploy", ...worker.args, "--var", `SHARED_MODULES:${hash}`], {
    cwd: root,
    stdio: "inherit",
  });
  process.exitCode = run.status ?? 1;
}

async function check() {
  let behind = 0;
  for (const [name, worker] of Object.entries(WORKERS)) {
    const { hash } = await fingerprint(worker.entry);
    let live = null;
    try {
      const res = await fetch(worker.live, { headers: { accept: "application/json" } });
      live = res.ok ? ((await res.json()).sharedModules ?? null) : null;
    } catch {}
    const state = live === hash ? "up to date" : live ? "behind: deploy it before pushing main" : "unknown: not deployed by this script yet";
    if (live !== hash) behind++;
    console.log(`${name.padEnd(10)} repo ${hash}  live ${String(live).padEnd(16)}  ${state}`);
  }
  process.exitCode = behind ? 1 : 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const [command, name] = process.argv.slice(2);
  if (command === "deploy") await deploy(name);
  else if (command === "check") await check();
  else {
    console.error("Usage: node scripts/shared-modules.mjs deploy backend|orderflow | check");
    process.exitCode = 1;
  }
}
