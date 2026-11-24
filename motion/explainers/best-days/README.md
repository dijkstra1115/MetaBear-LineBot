# 標普500 漲最多的 20 天（數據回放短片，9:16，97.5 秒）

無旁白、跟著配樂走的數據回放片。從 2025.04.09（+9.52%）切入，倒帶回 1950，把標普500 一路重播到 2026.11.23；每遇到 1950 年以來前 20 大漲幅日就打一根紅色能量柱，前 20 大跌幅日就落一道綠色閃電。線圖後面是一面 3D 公司磚牆（當代大型成分股的真實漲跌），整個場景由一台跟著音樂水平擺動、傾斜、推近的鏡頭拍攝。最後用三個結論收尾：

| 結論 | 值 | 對照：所有交易日 |
| --- | --- | --- |
| 前 20 大漲幅日在 200 日均線之下 | 20／20 | 28% |
| 前 20 大漲幅日距高點跌超過 20% | 19／20（唯一例外 2025.04.09，−18.9%） | 21% |
| 前後 14 天內有前 20 大跌幅日 | 13／20 | — |

風格參考 `motion/out/ref/viral/viral3.mp4`（納指100 回放，拆解見 [../playbook/breakdowns/viral3-nasdaq100.md](../playbook/breakdowns/viral3-nasdaq100.md)）；分鏡與畫面規格見 [SPEC.md](SPEC.md)。

## 數字從哪裡來

`scripts/data.py` 讀 `assets/data/gspc.csv`（Yahoo Finance `^GSPC` 日收盤價，1928 年起），寫出 `assets/js/data.js`。畫面上每個數字（排名、漲跌幅、距高點、200 日線、三個結論）都出自這個檔案。

- 單日漲跌 = 收盤 ÷ 前一日收盤 − 1
- 距高點 = 前一日收盤 ÷ 歷史最高收盤 − 1（最高點從 1928 年算起，所以 1950–54 仍在 1929 年高點之下）
- 200 日均線 = 前 200 個收盤的平均
- 排名範圍：1950.01.03–2026.11.23，19,346 個交易日

背景磚牆的數字由 `scripts/companies.py` 讀 `assets/data/companies-weekly.csv`（Yahoo Finance 還原權值後的週收盤，40 檔）寫出 `assets/js/companies.js`。三個年代各 20 家（1950–1989、1990–2009、2010–2026，大約依當時市值排序），磚塊大小只是版面、不代表市值。每格顯示的漲跌跟 HUD 的比較基準一致：空頭（距高點 ≤ −8%）時是「較指數高點那天」，其他時候是「近 52 週」；用的是前一個完整週的收盤，不偷看當週。Yahoo 的個股日線從 1962 年起才有，之前與尚未上市的公司顯示「—」。

## 製作流程（在本資料夾執行，Node.js 22+）

```sh
python -I scripts/data.py            # --fetch 會先從 Yahoo Finance 重抓 CSV
python -I scripts/companies.py       # --fetch 同上，重抓 40 檔公司週收盤
cp ../../audio-library/music/barrete.mp3 assets/audio/barrete.mp3
sh scripts/audio.sh                  # 配樂 -8.3 dB → assets/audio/soundtrack.wav（-14 LUFS）
npm run check
npm run render                       # 或 npx hyperframes@0.9.88 render -q delivery -o renders/best-days.mp4
```

改了畫面上的中文字，要重切字型：把 `compositions/film.html`、`assets/js/film.js` 與 `assets/js/companies.js` 用到的字寫進 `scripts/.chars.txt`，再用 `pyftsubset` 從 `motion/flow-arena/promo/scripts/font-src/NotoSansTC-full.ttf` 切出 `assets/fonts/NotoSansTC-sub.ttf`。

## 檔案

| 位置 | 內容 |
| --- | --- |
| `assets/js/film.js` | 整支片的畫面：節拍時鐘（第 b 拍 = b × 0.46168 秒）、鏡頭（`CAM`：水平轉角、牆面傾角、推近）、線圖、3D 公司磚牆與換年代翻牌、能量柱、閃電、火花、HUD、標籤、尾段的兩種變形視圖。`renderAt(t)` 只依 t 計算 |
| `assets/js/companies.js` | `scripts/companies.py` 產生，不要手改 |
| `assets/js/data.js` | `scripts/data.py` 產生，不要手改 |
| `compositions/film.html` | 版面與樣式（HUD、右側清單、標籤、結論卡） |
| `index.html` | 根：一個 film 場景加配樂 |
| `assets/audio/` | 配樂（使用者提供的 BARRETE，不進 Git） |

時間要改，改 `film.js` 的 `KEYS`（哪一拍走到哪一天）、`SPAN`（畫面顯示幾個交易日）與 `CAM`（鏡頭）；每個事件日都放在一個 key 上，事件才會剛好落在拍子上。

「非投資建議」與資料來源在片尾小字。
