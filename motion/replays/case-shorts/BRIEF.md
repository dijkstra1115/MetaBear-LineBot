---
workflow: general-video
flow: automation
storyboard: no
message: "一個關鍵位、一筆單：為什麼進場，多久到目標"
destination: 首頁案例牆、threads、reels、shorts
aspect: 1080x1920
language: zh-Hant
audience: 刷短影音的台灣幣圈交易者
length: 18–21s
angle: 5 分 K 快轉來勢 → 放大成 1 分足跡、慢速講進場證據 → 部位快速跑到目標
voice: none
---

## Intent

2026-10-27 使用者回饋：lab 的 #9 回放太長，02-15 / 08-31 短影音的節奏和形式比較好。把 [REPLAY-CASES-2026Q3.md](../../../docs/REPLAY-CASES-2026Q3.md) 的單筆案例做成同一種短片，之後放首頁案例牆。

和 08-31 的差別：單筆案例的理由在足跡圖上（吸收、堆疊），所以節奏是**快、慢、快**：

1. 5 分 K 快轉來勢（約 5 秒），標出關鍵位與當時的事件（例如突破舊高）。
2. 放大成 1 分足跡（每個 $10 價格格左賣右買，3:1 斜向失衡畫實色），慢速跑到進場，通知欄逐條跳出證據，堆疊失衡框起來。
3. 開單後 K 棒變窄、快速跑到目標，跳出「止盈 +nR」和用了幾分鐘。

畫面、字型、配色、片尾沿用 08-31；只有合成音效，沒有音樂。

## 一個模板，多個案例

- 案例寫在 `scripts/cases.mjs`：關鍵位、時間、通知與字幕文字。進場（A 激進：收回關鍵位的 1 分 K 收盤）、停損（極值外 0.1%）、目標（nR）和通知裡的數字都由 `scripts/extract.mjs` 從原始資料算出，畫面上的數字都能回溯。
- 爆倉區是 lab 的推估模型，畫成色帶並標「推估」。
- 目前：REPLAY-CASES 的 10 筆全部（#1～#10），輸出 `motion/out/case-<id>.mp4`，每支 19–22 秒。新增案例：先用 `scripts/orderflow-data.mjs` 下載那天的資料，在 `cases.mjs` 加一筆。
- 部位超過約 40 分鐘時，K 棒會窄到看不清足跡，自動改畫一般 K 棒；時間軸標籤的間隔也跟著放寬。

## 重建

一次全部（或指定 id）：`bash scripts/render-all.sh [id ...]`，需要 ffmpeg、ffprobe 在 PATH，python 有 fonttools、numpy、scipy。單支的步驟：

```sh
node scripts/extract.mjs 2026-09-14      # 需要 .data/orderflow/case-<UTC 日>.json
python scripts/subset-font.py            # 改過文字後
python scripts/sfx.py                    # 一次即可
node scripts/build.mjs 2026-09-14
node scripts/mix.mjs                     # FFMPEG= 指向 ffmpeg
npx --yes hyperframes@0.8.149 render -q delivery -o ../../out/case-2026-09-14.mp4
```
