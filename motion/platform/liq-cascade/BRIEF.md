---
workflow: general-video
flow: automation
storyboard: no
message: "盤面解剖：10/30 凌晨 9 分鐘跌 2.1%，訂單流看到的是一場多單連鎖爆倉"
destination: LINE、IG reels、shorts
aspect: 1080x1920
language: zh-Hant
audience: 會看 K 線、還沒用過訂單流的台灣幣圈交易者
length: 30s
angle: 先放崩跌和爆倉金額，問「發生什麼事？」，倒帶後依序看 OI、足跡、合約對現貨、第二波，最後一張圖講完因果鏈
voice: none
---

## Intent

2026-11-06 使用者：專門挑價格瞬間大幅波動、成交量暴增的時刻，用訂單流解釋可能的原因。從正式平台最近 29 天的全市場 1 分 K 依「振幅 × 成交量」排出前三名，使用者選了這一個（資料最完整：爆倉、現貨 CVD、溢價都有）。只描述發生了什麼，不放交易、不喊單（[VISION.md](../../../docs/VISION.md) 原則 4）。流程與畫面原則同 [spot-divergence/BRIEF.md](../spot-divergence/BRIEF.md)。

## 數字（台北時間）

| 片中 | 數字 | 來源 |
| --- | --- | --- |
| 跌幅 | 04:39 開 79,903.6 → 04:47 低 78,210.3（−2.1%） | Binance 1 分 K |
| 爆倉 | 04:39～04:48 多單 8,680 萬美元；第一波 04:41～04:43 4,450 萬、第二波 04:47 3,240 萬 | 平台的全市場紀錄（四家交易所） |
| OI | 04:30 196,373 → 04:40 198,220（+1,848）→ 04:45 197,443（−778） | 平台的全市場 OI（讀取時間） |
| 大單 | 04:42:48 主動買 252.4 BTC @ 79,303 | Binance aggTrades 同一毫秒同方向合併，是估算 |
| 合約對現貨 | 04:43 這分鐘 Binance 合約 Δ −2,039 BTC、Binance 現貨 Δ −199 BTC | aggTrades、現貨 1 分 K |
| 溢價 | 04:44 −0.06%，04:45 −0.08% | 平台紀錄 |
| 反彈 | 04:50 收 79,266.8 | Binance 1 分 K |

價格與足跡是 Binance；OI、溢價與爆倉用平台當天的全市場紀錄（`GET /api/orderflow/btcusdt/day?ex=all&d=2026-10-29`，存成 `.tape/api-all-2026-10-29.json`），也就是網站當時即時顯示的數字。

## 重建

同 spot-divergence（Node 22、ffmpeg、Playwright Chromium、Python 3 與 numpy、scipy、fonttools、`.cache/fonts/NotoSansTC-VF.ttf`）。在這個資料夾內：

```sh
(cd ../../.. && node scripts/orderflow-data.mjs --from 2026-10-29 --to 2026-10-29 --out .data/orderflow/btcusdt-1029.json)
curl -s -o .tape/api-all-2026-10-29.json "https://metabear.io/api/orderflow/btcusdt/day?ex=all&d=2026-10-29"   # 正式平台只保留 30 天
node scripts/build-case.mjs       # → .tape/case.data.json
node scripts/shots.mjs            # → assets/video/{hook,build,fp,panes,after}.mp4；--check 只存靜態圖
node scripts/build.mjs            # → index.html、assets/video/rewind.mp4
python scripts/subset-font.py
python scripts/score.py
npx --yes hyperframes@0.8.149 render -q delivery -f 30 -o renders/final.mp4
ffmpeg -y -i renders/final.mp4 -i assets/audio/soundtrack.wav -map 0:v -map 1:a -c:v copy -af "alimiter=limit=0.6:level=false:attack=1:release=30" -c:a aac -b:a 320k -shortest -movflags +faststart ../../out/liq-cascade-916-v1.mp4
```

正式平台的日資料只留 30 天，所以 `.tape/api-all-2026-10-29.json` 過了 11/28 就抓不到；要保留可重現性，把它複製到別處。
