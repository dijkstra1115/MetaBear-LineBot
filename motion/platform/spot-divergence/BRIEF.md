---
workflow: general-video
flow: automation
storyboard: no
message: "合約在賣、現貨在買，前低打不破：一筆單用訂單流工具一步一步看懂"
destination: LINE、IG reels、shorts
aspect: 1080x1920
language: zh-Hant
audience: 會看 K 線、還沒用過訂單流的台灣幣圈交易者
length: 30s
angle: 先給結果（止盈 +2R），倒帶回進場前，副圖一個一個打開，足跡看吸收和失衡，停格問觀眾，再跑到目標
voice: none
---

## Intent

2026-11-05 使用者：案例的開單邏輯太簡單，教不到其他工具，想挑一筆用很多工具拆解的單。挑的是 8/22 18:23（台北）回測 13:11 低點 76,510 的多單，理由見下表。回放案例夠真實但不夠吸引人，所以畫面維持真實的實驗室，吸引力交給剪輯：結果先放再倒帶、鏡頭推近、字卡、停格、配樂。v2 依使用者回饋：買方失衡要切成足跡圖並標出來；片尾拿掉標語。

原則沿用 [showreel/BRIEF.md](../showreel/BRIEF.md) 與 [VISION.md](../../../docs/VISION.md)：畫面是真實的 lab（幣安逐筆成交回放），不放勝率、不提回測，畫出停損，每個畫面附「依幣安真實成交資料回放・僅供教學，非投資建議」。

## 這筆單（台北時間，Binance BTCUSDT 永續）

| 工具 | 片中的數字 | 來源 |
| --- | --- | --- |
| 合約 CVD／現貨 CVD | 前 8 小時合約 −3,672 BTC、現貨 +194 BTC | `orderflow-data.mjs` 的 aggTrades 與現貨 1 分 K |
| OI | 18:00～18:20 從 106,059 到 106,581（+522） | metrics 封存檔（讀取時間對齊） |
| 溢價 | 18:20 為 −0.028% | premiumIndexKlines |
| 大單 | 18:22:45 賣 96.2 BTC @ 76,601；18:23:31／39 買 60.5、72.6 BTC @ 76,600 | aggTrades 同一毫秒同方向合併，是估算 |
| 前低 | 18:23 低點 76,512.9，沒破 13:11 的 76,510 | 1 分足跡 |
| 買方失衡 | 18:26：76,640 買 62.3 對 76,630 賣 17.2；76,630 買 28.8 對 76,620 賣 0.9 | 1 分足跡，斜向 3 倍 |
| 部位 | 18:26 收盤（18:27:00）進場 76,667.9，停損 76,436（−0.30%，低點外 0.1%），目標 2R 77,131.8，18:39:19 碰到（12 分鐘） | lab 回放依逐秒成交判定 |

## 分鏡（`scripts/cues.json`）

| 秒 | 畫面 | 字卡 |
| --- | --- | --- |
| 0–2.5 | 1 分 K，部位走到目標，鏡頭拉遠 | 「8/22 BTCUSDT 多單」→「止盈 +2R・12 分鐘」 |
| 2.5–3.5 | 同一段倒著快轉 | 「◀◀ 18:22 倒回進場前」 |
| 3.5–12.3 | 15 分 K，副圖依序打開：CVD、現貨 CVD、OI、溢價 | 一路往下跌／主動賣一直打／現貨卻一直買／新空單追進／合約打折賣 |
| 12.3–18.3 | 1 分足跡 18:22～18:23:44，推近到前低 | 賣單砸下來／96 BTC 大賣單／打到前低，沒破／大買單接回來 |
| 18.3–19.7 | 停格變暗 | 「你會進場嗎？」（配樂只剩心跳） |
| 19.7–22.4 | 18:26 的 1 分足跡，收盤時框出兩格並推近 | 連續兩格買方失衡／買單是下一格賣單的 3 倍以上 |
| 22.4–25.9 | 1 分 K，進場到目標 | 收盤進場 76,668・停損放前低下 →「止盈 +2R・12 分鐘」 |
| 25.9–30 | 標誌、MetaBear 訂單流實驗室、metabear.io、揭露 | |

## 重建

Node 22、ffmpeg（`FFMPEG=`）、Playwright Chromium、Python 3（numpy、scipy、fonttools），Noto Sans TC 變數字型放在 repo 的 `.cache/fonts/NotoSansTC-VF.ttf`（或 `FONT_SRC=`）。在這個資料夾內：

```sh
(cd ../../.. && node scripts/orderflow-data.mjs --from 2026-08-21 --to 2026-08-24 --out .data/orderflow/btcusdt-aug.json)
node scripts/build-case.mjs       # → .tape/case.data.json（逐秒成交、OI、溢價、現貨）
node scripts/shots.mjs            # → assets/video/{context,sweep,imbalance,trade}.mp4；--check 只存靜態圖
node scripts/build.mjs            # → index.html、assets/video/rewind.mp4
python scripts/subset-font.py     # 改字後
python scripts/score.py           # 配樂全部程式合成 → assets/audio/soundtrack.wav
npx --yes hyperframes@0.8.149 render -q delivery -f 30 -o renders/final.mp4
# 算圖會壓低音軌，所以換回原始混音：
ffmpeg -y -i renders/final.mp4 -i assets/audio/soundtrack.wav -map 0:v -map 1:a -c:v copy -af "alimiter=limit=0.6:level=false:attack=1:release=30" -c:a aac -b:a 320k -shortest -movflags +faststart ../../out/spot-divergence-916-v2.mp4
```

錄影只在本機瀏覽器改 lab（`scripts/shots.mjs`）：隱藏回放控制列、徽章、字幕、縮放鈕與圖上的回放註記；價格範圍平滑移動；回放時鐘每一幀固定前進一格（`window.__step`），截圖本身不會讓它跑快，所以每次錄的都一樣。`.tape/`、`assets/video/`、`assets/audio/` 與 `renders/` 不進 Git。
