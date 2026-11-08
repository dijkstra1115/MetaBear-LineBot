# 實盤教學 01：一張圖長出整個計畫（SPEC）

2026-11-08 使用者選定劇情 A（見 [STORYLINES.md](STORYLINES.md)）。英文旁白，中英雙語字幕。VAL 用使用者當時在平台畫面上看到的 79,855，片中註明來源。

```text
GOAL:    看完的人記得「分歧是警訊，破位是訊號，回測才是進場」，並知道計畫（進場、停損、目標）要在進場前寫好。
OUTPUT:  HyperFrames，1920 x 1080，30 fps
TIME:    約 78 s x 30 = 2,340 frames（旁白定稿後依實際長度調整）；配樂 90 BPM，一拍 20 frames，一小節 80 frames
LOOK:    實驗室本身就是材質：深色圖表 #0b1118、格線 #1a2430、買 #2fd3c0、賣 #f2994a、金色 #e8bd7d 只給 POC 與最後的結果。
         字幕：Noto Sans TC 600，中文 40 px、英文 30 px（JetBrains Mono 不用在字幕），放在下方 80% 安全框內，深色底 0.72 不透明。
         計畫卡：與 lab 相同的卡片樣式（#101823 底、1 px #263241 框、圓角 8 px），數字用 JetBrains Mono 600 44 px。
         片面沒有光暈、粒子或漸層；景深只用鏡頭推近，不加模糊。
OBJECTS: 15 分 K 線圖（真實 lab 錄影）；CVD 與現貨 CVD 兩個副圖；POC、VAL、下方 POC 三條線（lab 自己畫的價位線）；
         20:31 的大單泡泡；進場、停損、目標三條線與部位框（lab 的部位功能）；一張計畫卡；四根「還不是時候」的 K 棒標記。
MOTION:  鏡頭推近用 power3.inOut，24～36 frames；元素進場 power2.out 12 frames；字幕切換為硬切；數字跳動 18 frames。
         一個鏡頭只有一個主要動作，其餘不動。
BANNED:  STORYLINES 以外的特效；字幕逐字重複旁白以外的字卡；三張卡片並排；角落小 logo；倒數或勝率字樣；
         旁白提到回測或勝率。
QA:      見文末。
```

## 旁白稿與字幕

英文旁白約 155 字，預計 70～80 秒。每一行是一個提示點，畫面在旁白講到時才出現對應的元素。中文字幕是同一句的翻譯，不是另外的字卡。

| # | 英文旁白 | 中文字幕 | 畫面在這句出現的東西 |
| --- | --- | --- | --- |
| 1 | Price is holding. | 價格守住了。 | 15 分 K，價格貼著金色 POC 橫走 |
| 2 | So why was I getting ready to short? | 那我為什麼準備做空？ | 鏡頭往下看到現貨 CVD 一路下滑 |
| 3 | November fifth. Bitcoin, fifteen-minute chart. | 11 月 5 日，比特幣，15 分 K。 | 日期與「全市場聚合」標示 |
| 4 | Each high is a little lower than the last. | 每個高點都比前一個低一點。 | 高點依序標出 80,629 → 80,400 |
| 5 | Futures flow is flat. | 合約的主動買賣打平。 | CVD 副圖亮起，持平 |
| 6 | But spot traders keep selling. | 但現貨一直有人在賣。 | 現貨 CVD 副圖亮起，從 −897 跌到 −1,350 |
| 7 | Spot is leaving, and futures are holding the price up. | 現貨在離場，價格靠合約撐著。 | 兩個副圖並排對照 |
| 8 | That's a warning. Not a trade. | 這是警訊，還不是進場點。 | 停格一拍 |
| 9 | At 8:30, a market sell of about 190 bitcoin hits. | 20:30，一筆約 190 顆比特幣的主動賣單砸下來。 | 20:31 OKX 188 BTC 大單泡泡 |
| 10 | Price breaks out of the value area, and futures selling takes over. | 價格跌出價值區，合約賣壓接手。 | 20:30 這根收在 79,700；CVD 從 −163 掉到 −3,342 |
| 11 | Now I write the plan, before any order. | 現在先寫計畫，還沒下單。 | 計畫卡出現，三格空白 |
| 12 | The volume profile on my screen, about the last day, puts the value area low at 79,855. | 畫面上約一天的成交量分布，價值區下緣（VAL）在 79,855。 | VAL 線與 24 小時區間的框，卡片第一格填入「進場 79,850」 |
| 13 | If price comes back up to it, I short. | 價格回到這裡，我就空。 | 箭頭指回 VAL |
| 14 | The stop goes above the point of control, at 80,400. | 停損放在上方成交最密集的價位（POC），80,400。 | POC 線，卡片第二格填入停損 |
| 15 | The target is the next point of control down, 77,800. | 目標是下方的 POC，77,800。 | 鏡頭拉遠到下方 POC 線，卡片第三格填入目標 |
| 16 | Then I wait. | 然後等。 | 20:45 起每根 K 收盤時標一個「未回測」 |
| 17 | One candle. Two. Three. Four. None of them come back. | 一根、兩根、三根、四根，都沒有回來。 | 四根 K 依序標記，最高 79,800／79,747／79,732／79,755 |
| 18 | At 9:45, price touches 79,850, and selling returns. | 21:45，價格回到 79,850，賣壓回來了。 | 21:45 這根碰到 VAL，Δ −733 |
| 19 | Short. | 進場做空。 | lab 的部位框打開：進場、停損、目標三條線 |
| 20 | Price never gets close to the stop. | 價格完全沒有靠近停損。 | 進場後最高 79,856 |
| 21 | At 11:01, it reaches 77,800. About three point seven times the risk. | 23:01 到達 77,800，約 3.7R。 | 碰到目標，金色「3.7R」 |
| 22 | The divergence is the warning. The break is the signal. The retest is the entry. | 分歧是警訊，破位是訊號，回測才是進場點。 | 三句依序疊在最後一格畫面上 |

片尾卡（無旁白，3 秒）：MetaBear 標誌被帶進畫面，「MetaBear 訂單流實驗室・metabear.io」，下方小字「非投資建議」。全片右下角一行小字：「真實數據・BTCUSDT 永續全市場聚合・台灣時間・VAL 取自當時 MetaBear 訂單流平台畫面上的成交量分布・非投資建議」。

VAL 的來源（2026-11-08 使用者確認）：使用者當天用的就是 MetaBear 訂單流平台，成交量分布指標跟著畫面上看得到的 K 棒計算，79,855 是當時畫面範圍（約前一天）的結果。用新的固定區間工具精確框 11/04 20:30～11/05 20:30 會得到 80,012.5，所以旁白說「畫面上約一天」，不說「前 24 小時」。

CVD 與現貨 CVD 的數值以 lab 畫面上顯示的為準（累計起點跟著畫面），表中的 −897、−1,350、−3,342 是從 UTC 日初累計的參考值，不寫進字幕。

## 鏡頭（錄影來源都是真實 lab 回放）

| 鏡頭 | 旁白 | lab 回放設定 | HyperFrames 上的動作 |
| --- | --- | --- | --- |
| 1 開場 | 1～2 | 15 分 K，16:00～20:15，POC 線，副圖全關 | 從價格推近，旁白第 2 句時鏡頭下移，現貨 CVD 副圖亮起 |
| 2 分歧 | 3～8 | 同上，CVD、現貨 CVD 依序打開 | 高點標記依序出現；第 8 句停格 |
| 3 破位 | 9～10 | 20:15～20:45，速度放慢，大單泡泡 ≥ 100 BTC | 泡泡出現時重擊；CVD 數字跳動 |
| 4 計畫 | 11～15 | 停在 20:45；縮小到能看見 11/04 20:30 起的 24 小時；VAL、POC、下方 POC 三條線依序畫上 | 計畫卡在右側長出三格，每格在旁白講到時填入 |
| 5 等待 | 16～17 | 20:45～21:45，每根 K 收盤停一拍 | 每根 K 上方標「未回測」與最高價；滴答聲 |
| 6 進場 | 18～19 | 21:45，部位打開（進場 79,850、停損 80,400、目標 77,800） | 卡片收進部位框；一記短促的重擊 |
| 7 結果 | 20～21 | 21:45～23:01，到目標 | 金色 3.7R；配樂回到主旋律 |
| 8 收尾 | 22 | 停在 23:01 | 三句話依序疊上 |
| 9 片尾 | — | — | 標誌與網址，3 秒 |

## 製作順序

1. 資料：從正式平台抓 11/01～11/05 的全市場日資料（`?ex=all`），存成 `.tape/api-all-*.json`；平台只保留 30 天，12/01 起 11/01 就抓不到，所以先抓。
2. `scripts/build-case.mjs`：把全市場 1 分 K 轉成 lab 回放格式（每分鐘一格，15 分 K 用不到秒級資料）。
3. 旁白：ElevenLabs Brian（`eleven_v3`）。分段產生，每一段用 Whisper 對時間，產出 `cues.json`。
4. `scripts/shots.mjs`：用 Playwright 驅動真實 lab 錄 1920×1080（960×540 的 2 倍），每個鏡頭一支影片。
5. `scripts/build.mjs`：組成 `index.html`，字幕與計畫卡是 HyperFrames 圖層。
6. `scripts/score.py`：程式合成配樂，旁白段落自動壓低音量。
7. `check`、`snapshot --review`、`REVIEW.md`，再開預覽給使用者看，確認後才算圖。

## 重建

Node 22、ffmpeg（`FFMPEG=`）、Playwright Chromium、Python 3（numpy、scipy、fonttools、openai-whisper），Noto Sans TC 變數字型放在 repo 的 `.cache/fonts/NotoSansTC-VF.ttf`（或 `FONT_SRC=`，來源 github.com/google/fonts 的 ofl/notosanstc），`motion/.env` 要有 `ELEVENLABS_API_KEY`。在這個資料夾內：

```sh
for d in 2026-10-31 2026-11-01 2026-11-02 2026-11-03 2026-11-04 2026-11-05; do curl -s -o .tape/api-all-$d.json "https://metabear.io/api/orderflow/btcusdt/day?ex=all&d=$d"; done   # 平台只留 30 天
node scripts/build-case.mjs       # → .tape/case.data.json（全市場 1 分 K 當回放）
python scripts/voice.py           # ElevenLabs Brian，每段一個檔 → assets/audio/vo/
python scripts/words.py           # 每個字的時間 → assets/audio/vo/words.json
node scripts/timeline.mjs         # 全片時間表 → assets/audio/vo/timeline.json
node scripts/shots.mjs            # 六個鏡頭 → assets/video/*.mp4；--check 只存每秒一張靜態圖
python scripts/score.py           # 配樂合成並混入旁白 → assets/audio/soundtrack.wav
python scripts/subset-font.py     # 改字後
node scripts/build.mjs            # → index.html
npx --yes hyperframes@0.8.149 render -q delivery -f 30 -o renders/final.mp4
# 算圖會壓低音軌，所以換回原始混音：
ffmpeg -y -i renders/final.mp4 -i assets/audio/soundtrack.wav -map 0:v -map 1:a -c:v copy -c:a aac -b:a 320k -shortest -movflags +faststart ../../out/social/live-trade-01-v4.mp4
```

旁白每次生成都不一樣，重錄後 `timeline.mjs` 會讓整部片跟著新的時間走，但要重錄鏡頭與配樂。

## QA

| 時間點 | 必須看到 |
| --- | --- |
| 第 0 格 | 已經有 K 線和金色 POC，不是黑畫面 |
| 旁白第 6 句 | 現貨 CVD 副圖一路下滑，合約 CVD 持平 |
| 旁白第 9 句 | 188 BTC 大單泡泡在 80,050 |
| 旁白第 12～15 句 | 計畫卡三格依序填入，數字與上表一致 |
| 旁白第 17 句 | 四根 K 的最高價都低於 79,850 |
| 旁白第 19 句 | 停損線在 80,400、目標線在 77,800 |
| 旁白第 21 句 | 23:01，價格碰到 77,800 |
| 每一格 | 右下角的資料說明與「非投資建議」看得到 |
