import fs from "node:fs";
// Editable vector UI: exact typography and six deterministic tap regions.
const icons = [
  '<rect x="4" y="8" width="64" height="48" rx="9"/><circle cx="23" cy="29" r="7"/><path d="M13 46q10-13 20 0M42 24h15M42 36h15"/>',
  '<circle cx="35" cy="33" r="28"/><path d="m20 33 10 10 23-23"/>',
  '<path d="M35 14Q14 2 4 9v47q17-8 31 3 14-11 31-3V9q-10-7-31 5v45M14 23l12 4M14 34l12 4M45 27l12-4M45 38l12-4"/>',
  '<rect x="5" y="14" width="62" height="45" rx="9"/><path d="M5 24h62M19 42h11M45 4v15m-7-7 7 7 7-7"/>',
  '<path d="M6 5v55h62M16 46l14-16 12 7 22-25M53 12h11v11"/>',
  '<path d="M9 37v-9a26 26 0 0 1 52 0v9M9 29H5v19h10V29H9m52 0h5v19H56V29h5M60 49q-1 12-23 12"/><rect x="29" y="56" width="12" height="8" rx="4"/>',
];
const labels = [
  "登記 UID",
  "審核進度",
  "新手教學",
  "入金教學",
  "交易學習",
  "人工協助",
];
const notes = [
  "提交帳號・開始核對",
  "查看結果・重新查詢",
  "註冊・KYC 一步一步",
  "台幣入金・信用卡買幣",
  "看懂市場・掌握風險",
  "遇到問題，找小幫手",
];
const colors = [
  "#78e1d5",
  "#78e1d5",
  "#e8bd7d",
  "#e8bd7d",
  "#78e1d5",
  "#e8bd7d",
];
let body = "";
for (let i = 0; i < 6; i++) {
  const col = i % 3,
    row = Math.floor(i / 3),
    x = col * 833 + (col === 2 ? 1 : 0),
    y = row * 843;
  body += `<g transform="translate(${x} ${y})"><rect x="25" y="${row ? 25 : 150}" width="783" height="${row ? 793 : 668}" rx="30" fill="${i === 0 ? "#112c36" : "#101c2a"}" stroke="${i === 0 ? "#78e1d55a" : "#b9d8eb20"}" stroke-width="2"/><text x="82" y="${row ? 102 : 225}" font-size="24" letter-spacing="4" fill="#8099ac">0${i + 1}</text><g transform="translate(338 ${row ? 178 : 283}) scale(2.1)" fill="none" stroke="${colors[i]}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">${icons[i]}</g><text x="416" y="${row ? 480 : 569}" font-size="72" font-weight="600" text-anchor="middle" fill="#edf2f4">${labels[i]}</text><text x="416" y="${row ? 550 : 639}" font-size="32" text-anchor="middle" fill="#94a8b9">${notes[i]}</text><text x="733" y="${row ? 747 : 759}" font-size="40" fill="${colors[i]}" text-anchor="end">↗</text></g>`;
}
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="2500" height="1686" viewBox="0 0 2500 1686"><rect width="2500" height="1686" fill="#080e18"/><g font-family="Microsoft JhengHei,Noto Sans TC,sans-serif"><text x="75" y="94" fill="#edf2f4" font-weight="700" font-size="52" letter-spacing="2">MetaBear<tspan fill="#78e1d5">.</tspan></text><text x="2420" y="88" fill="#94a8b9" font-size="24" letter-spacing="4" text-anchor="end">YOUR NEXT STEP / 從這裡開始</text>${body}</g></svg>`;
fs.writeFileSync("public/line-rich-menu.svg", svg);
// Set SHARP_MODULE to a bundled sharp module path when sharp is not installed locally.
const sharp = (await import(process.env.SHARP_MODULE || "sharp")).default;
await sharp(Buffer.from(svg))
  .png({ compressionLevel: 9 })
  .toFile("public/line-rich-menu.png");
console.log(
  JSON.stringify({
    width: 2500,
    height: 1686,
    bytes: fs.statSync("public/line-rich-menu.png").size,
    labels,
  }),
);
