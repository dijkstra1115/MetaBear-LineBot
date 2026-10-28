---
workflow: general-video
flow: automation
storyboard: no
message: "挑一段真實行情，照規則開的每一筆都放上來，停損的也是"
destination: 首頁案例牆、threads、reels、shorts
aspect: 1080x1920
language: zh-Hant
audience: 刷短影音的台灣幣圈交易者
length: 20–35s
angle: 5 分 K 快轉，一段時間裡同一條規則的每一筆單依序跳出通知、開單、止盈或停損
voice: none
---

## Intent

2026-10-27 使用者回饋：案例牆的 10 筆單筆案例全是獲利，看起來像挑出來的。改成「一段行情，一筆不漏」：時間段可以挑，但段內規則開的每一筆都要出現，輸比贏多的時間段不用。規則、時間段與篩選見 [REPLAY-CASES-2026Q3.md](../../../docs/REPLAY-CASES-2026Q3.md)「案例牆」一節。

畫面、通知欄、片尾沿用 [08-31](../2026-08-31-short/BRIEF.md)；和它的差別：

- 一支片只有一條規則：右上角是規則名、狀態（監控中／持多／止盈／停損），下面每一筆一個圓點，平倉後填上結果色，交代「這段的每一筆」都在片裡。
- 字幕前面用圈號（①②③…）標第幾筆；原本的「1/5」容易被看成日期（2026-10-28 使用者回饋）。
- 開場說明卡（2026-10-28）：圖表停住約 2.6 秒，通知欄位置寫時間段、規則一句話、「停損也照放 · 共 n 筆」，第一則通知出現時淡出；文字由 `extract.mjs` 從資料產生。
- 背景數據（2026-10-28）：每一筆開單前多兩行灰藍色通知，回測區（關鍵位 ±0.15%）從碰到到進場的主動賣／買，以及近 15 分鐘淨 delta 與 OI 1 小時變化。不是規則的條件，每一筆都量、照實列出，停損那幾筆也是。通知欄因此改成 5 行，圖表下移。
- 翻轉規則的時間段，那條線整段都在畫面上；關鍵位拒絕的時間段畫前日高低，其他關鍵位隨單出現。
- 沒有音樂，只有 `scripts/sfx.py` 合成的音效（同 case-shorts）。
- 片尾宣傳官網 metabear.io，不放 LINE 連結：短影音的觀眾讀得到網址，但點不了連結（2026-10-28 使用者回饋）。
- 不放大成足跡慢動作：每一筆同樣節奏，不突顯原本的案例。單筆足跡片之後每一筆（含停損）各做一支，從案例牆清單點開。

## 時間段

`scripts/segments.mjs`。交易由 `node scripts/replay-cases/scan-case-rules.mjs --json`（repo 根目錄）算出，寫到 `.data/orderflow/replay-cases/case-rule-trades.json`；`scripts/extract.mjs` 依同一條「一次一筆」的規則取出時間段內的每一筆。爆倉叢集那段（08-21～09-16）一個月只有 5 筆，節奏要另外設計，還沒有。

## 重建

需要 Node 22、ffmpeg、python（fonttools、numpy、scipy）。

```sh
node scripts/extract.mjs 2026-09-14
node scripts/build.mjs 2026-09-14
python scripts/subset-font.py        # 改過文字後
python scripts/sfx.py                # 一次即可
node scripts/mix.mjs 2026-09-14
npx --yes hyperframes@0.8.149 render -q delivery -o ../../out/segment-2026-09-14.mp4
```
