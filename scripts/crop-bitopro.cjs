// Deterministic crops of user-provided screenshots; no generated interface pixels.
// Usage: node scripts/crop-bitopro.cjs <Notion asset bundle directory>
const sharp = require("sharp");
const path = require("node:path");
const root = process.argv[2];
if (!root) throw Error("Provide the downloaded Notion asset directory.");
const crops = [
  [
    "f2accb327b580380",
    "bitopro-01a",
    { left: 90, top: 80, width: 386, height: 755 },
  ],
  [
    "f2accb327b580380",
    "bitopro-01b",
    { left: 600, top: 80, width: 400, height: 755 },
  ],
  [
    "f2accb327b580380",
    "bitopro-01c",
    { left: 1125, top: 80, width: 393, height: 755 },
  ],
  // The user requested the complete recharge screenshot, including balances.
  [
    "2ab18ae0d0eca47c",
    "bitopro-04",
    { left: 0, top: 0, width: 1024, height: 1820 },
  ],
  // Focus on amount and fees; the source's network/address example is inconsistent.
  [
    "45a26ec23dbf422d",
    "bitopro-10",
    { left: 58, top: 463, width: 397, height: 371 },
  ],
];
(async () => {
  for (const [id, name, region] of crops) {
    await sharp(path.join(root, id + ".png"))
      .extract(region)
      .jpeg({ quality: 95, chromaSubsampling: "4:4:4" })
      .toFile(path.join("public/guides", name + ".jpg"));
    console.log(name);
  }
})().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
