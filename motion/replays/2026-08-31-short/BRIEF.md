---
workflow: general-video
flow: automation
storyboard: no
message: "五個策略一起跑一天半，照規則開的每一筆單"
destination: threads, reels, shorts
aspect: 1080x1920
language: zh-Hant
audience: 刷短影音的台灣幣圈交易者
length: 32s
angle: fast bar-by-bar chart replay with a strategy panel, trades pop up with target and stop
voice: none
music: raya-sped-up at -28 dB
---

## Intent

短影音覆盤第二版（2026-10-21），沿用 [2026-02-15-short](../2026-02-15-short/BRIEF.md) 的畫面，依使用者回饋修改：

- 連續 5 筆、只有 1 筆虧損，行情在近三個月內，策略 A～E 都可以用。
- **不放音樂，只留音效**：音樂讓影片像在推銷；要維持專業、工程師的形象，看起來像開發者在展示自己的交易系統。
- 標題列右側的策略面板列出 A～E，持倉中的策略會亮起來；其他策略顯示「監控中」，交代它們有在跑、只是這段沒有觸發。
- 第二輪回饋（同日）：開單前要先跳出很精簡的盤面通知（例如「大額成交」），像系統收到通知才下單。OHLC 與圖表之間有一條通知欄，每則通知都是那條規則用到的真實數字（`scripts/extract.mjs` 的 `alerts()`）：觸及或站上哪個價位、單一分鐘單一 $10 價格格 ≥ 30 BTC 的大額成交（和策略 E 的備用條件相同）、急跌幅度、反彈量縮比例；接著一行「B 開多 價格」。
- 同一輪也改回加背景音樂，音效為主；先照使用者指定壓在 −50 dB，手機上聽不到，再依使用者要求調到 **−28 dB**。上一版只有音效的輸出另存為 `motion/out/replay-2026-08-31-short.mp4`，這版是 `replay-2026-08-31-short-alerts.mp4`。

## 選段規則

- `scripts/replay-cases/scan-strategies.mjs --since 2026-07-21 --n 5 --max-stops 1 --max-hours 36`；策略規則在 `scripts/replay-cases/strategies.mjs`，門檻在選段前固定。
- 在 36 小時內符合條件的只有這一段（2026-08-31 15:10 至 09-01 22:38 台灣時間），而且這段 A～E 五個策略都在跑：期間任一策略開的單都會出現，沒有排除任何策略。放寬到 48 小時還有 4 段，但都要排除 D 或 E 才湊得出來。
- 片中 5 筆：B 4 筆、C 1 筆；A、D、E 在這段沒有觸發。

## D、E 的規則

2026-10-21 使用者確認：D 多空都做、停損停利是價格 ±1%；E 的大單門檻 30 BTC。其餘仍用 `strategies.mjs` 的 `DEFAULTS_NOTE`，見兩份策略文件的「待使用者確認」：

- D：只用 M5、多空都做；大額買單（賣單）= 主動買（賣）量高於前 48 根平均 2.5 個標準差；爆倉位 = 實驗室爆倉模型中該方向爆倉量最大的 20 個價格格；反向影線 ≥ 整根 K 棒的一半；下一根沒回到價位就放棄；停損停利 = 價格 ±1%。
- E：價值區 70%；停損 VAL 下方 0.1%；突破要在開盤後 4 小時內，回測算到美股收盤；M1 收在 POC 下方就放棄；大單 = 同一分鐘、同一個 $10 價格格的主動賣合計 ≥ 30 BTC（歷史資料沒有逐筆成交，用文件裡的備用條件）；大單後 5 根 M1 內要收回；目標 1.25R。

## 內部統計（不對外，VISION 原則 1）

2026-07-21 至 2026-10-11：A 3 筆（2 勝 1 負）、B 103 筆（50 勝 53 負）、C 12 筆（4 勝 8 負）、D 7 筆（3 勝 4 負；加入做多鏡像後重跑，片中這段仍沒有 D 的單）、E 20 筆（4 勝 14 負、2 筆逾時），未扣手續費。照目前寫法看不出優勢；這支片呈現的是挑出的一段。

## Assets

- `assets/data/replay.json`：`scripts/extract.mjs` 從 `../../../.data/orderflow/btcusdt-90d.json` 切出。
- 音效：全部由 `scripts/sfx.py`（numpy＋scipy）合成在 `assets/audio/sfx/synth/`，不進 Git、可重建：K 棒點擊、通知（A5→E6 兩音）、開單（上揚短音＋低頻）、停利（A 大調琶音）、停損（E5→A4 下降、壓低高頻）、結尾氣流聲。使用者回饋音效庫的素材和這支片不搭（2026-10-21），所以改用自己合成的一套。
- `assets/audio/song.mp3`：〈Raya (Sped Up)〉，使用者提供、已取得授權，不進 Git。

## 重建

```sh
node scripts/extract.mjs      # 需要先跑 scan-strategies.mjs
node scripts/build.mjs
FONT_SRC=<NotoSansTC-full.ttf> python scripts/subset-font.py
python scripts/sfx.py
node scripts/mix.mjs
npm run render
```
