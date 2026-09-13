// Format conversion only: preserve the original screenshot pixels and layout.
// Usage: node scripts/prepare-images.cjs <sharp-module-path> <registration-file> <kyc-file>
const fs = require("node:fs/promises");
const sharp = require(process.argv[2]);
(async () => {
  await fs.mkdir("public/guides", { recursive: true });
  for (const [i, name] of ["register", "kyc"].entries()) {
    await sharp(process.argv[i + 3])
      .jpeg({ quality: 95, chromaSubsampling: "4:4:4" })
      .toFile(`public/guides/${name}.jpg`);
  }
})().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
