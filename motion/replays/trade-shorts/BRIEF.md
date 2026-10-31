---
workflow: general-video
flow: automation
storyboard: no
message: "段落片裡的每一筆，各自放大成 1 分足跡：開單前看到什麼、最後打到停利還是停損"
destination: 首頁案例牆播放框（點清單裡的一筆）
aspect: 1080x1920
language: zh-Hant
audience: 看過段落片、想看某一筆細節的人
length: 18–25s
angle: 5 分 K 快轉來勢 → 放大成 1 分足跡、慢速跑到進場 → 部位跑到停利或停損
voice: none
---

## Intent

案例牆第二版（[REPLAY-CASES-2026Q3.md](../../../docs/REPLAY-CASES-2026Q3.md)「案例牆」）：段落片裡的每一筆各做一支單筆足跡片，停損的也做，從播放框的清單點開。模板沿用 [case-shorts](../case-shorts/BRIEF.md) 的快、慢、快節奏，差別：

- 不再手寫案例：`scripts/trades.mjs` 從 [segments](../segments/BRIEF.md) 的 `assets/data/*.json` 產生每一筆，進場、停損、目標、結果、通知文字都和段落片相同。
- 停損也拍：出場時打到停損就是紅色的「停損 −1R」與邊框，音效換成停損那一聲。
- 右上角標「9/14 · 第 3 筆」，字幕用圈號標第幾筆（不用「3/4」，以免看成日期）。
- 片尾宣傳 metabear.io，不放 LINE 連結。
- 通知放在發生的那一分鐘：碰到關鍵位在碰到那分鐘、刺穿在極值那分鐘，背景數據和堆疊在進場那分鐘；放大前的通知出現在第一根慢速 K 棒，時間照原本標。

## 重建

需要 Node 22、ffmpeg、python（fonttools、numpy、scipy），以及 `.data/orderflow/btcusdt-90d.json`。

```sh
node scripts/extract.mjs 2026-09-14-3     # <段落 id>-<第幾筆>
python scripts/subset-font.py             # 改過文字後
python scripts/sfx.py                     # 一次即可
node scripts/build.mjs 2026-09-14-3
node scripts/mix.mjs
npx --yes hyperframes@0.8.149 render -q delivery -o ../../out/website/trade-2026-09-14-3.mp4
node scripts/export-web.mjs               # 全部輸出後，網頁版與封面到 ../../out/website/web/
```
