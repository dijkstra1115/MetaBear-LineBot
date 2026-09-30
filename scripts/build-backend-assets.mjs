import { copyFile, mkdir, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { backendAssets } from "./deployment-layout.mjs";

const output = new URL("../dist/backend/", import.meta.url);
// Only remove this fixed generated directory, never public/ or a user path.
await rm(fileURLToPath(output), { recursive: true, force: true });
await mkdir(output, { recursive: true });
for (const name of backendAssets)
  await copyFile(new URL("../public/" + name, import.meta.url), new URL(name, output));
console.log(`Backend: ${backendAssets.length} staff/branding assets → dist/backend`);
