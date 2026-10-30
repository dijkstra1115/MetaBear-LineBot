---
workflow: general-video
flow: automation
storyboard: no
message: "案例牆放大進真實盤面：先停損、再止盈的連續開單，接盤面旁白與訂單流功能"
destination: 官網、短影音、作品集
aspect: 1920x1080
language: zh-Hant
audience: 看訂單流、想知道 MetaBear 在做什麼的台灣幣圈交易者
length: 30s
angle: 兩次「突然安靜、堆積、爆發」：第一次爆在止盈，第二次爆在功能環繞
voice: none
---

## Intent

2026-10-30 使用者的回饋，依序：

1. 看過 88 秒第一版：特別做的 3D 圖（足跡城市、掛單地形）會出戲；片長壓在 30 秒內；特色是**盤面旁白**與**實戰覆盤連續開單的真實感**。
2. 看過 30 秒第一版：拿掉空足跡開場；畫面不要有進度條和「歷史回放中」，案例回放功能之後不給學員用，直接呈現成真實開單的盤面；保留案例牆放大和各功能 3D 環繞；文字再精簡。
3. 看過 v2：順序改成**案例牆 → 放大進實盤（銜接感要強）→ 盤面旁白 → 訂單流功能（清算熱力圖、掛單熱力圖、大額成交…）→ 功能環繞**；要有情緒與鏡頭語言，例如突然安靜、堆積情緒、再一次爆發。
6. 看過 v5：音樂好很多。一鍵覆盤前的 1 分 K 全景多停 0.2 秒（按下仍在 14 秒的小節線上）；開場字改成使用者定案的「訂單流，實盤交易紀錄。」，發文時的說明由使用者處理。
5. 看過 v4：還是有斷點和剪接感。原因是畫面切點落在拍子之間（11.8、13.8），每個切點又各有一組音效，段落的和弦也和切點無關。所以切點改到小節線上（12、14、16），切點音效大幅減少，每次爆發落在 A、下一小節解決到 Dm；一鍵覆盤前的盤面改成 1 分 K，按下時 K 棒位置不動，只是倒回去。
4. 看過 v3：11–12 秒和 15 秒的音樂切換像兩段不同的音樂，所以止盈、旁白、功能現在是同一首歌、同一個節拍，靠音量和濾波漸變；一鍵覆盤改成在同一個盤面上回放（lab 本身的改動），片中從按下那一刻連續播下去；23 秒爆發前不再停頓，旋轉與音效一路接進去。

原則（[VISION.md](../../../docs/VISION.md)、[REPLAY-CASES-2026Q3.md](../../../docs/REPLAY-CASES-2026Q3.md)）：

- 畫面用的是真實數據（幣安逐筆成交），不用再加「歷史資料」的字樣。保留「每一筆都依幣安真實成交資料回放；僅供教學，非投資建議。」（實盤段落與片尾）。
- 不放勝率、總 R、回測結論；每一筆都畫停損，停損的和獲利的一起出現。
- 清算熱力圖在 lab 裡叫爆倉地圖，是模型估算，所以片中標「估算」。

## 故事

情緒線來自真實資料：9/14 同一條線（9/12 高點 77,477），20:58 開的多單 21:06 停損，21:10 再開一筆，21:30 到 2R。案例牆上的 9/14 21:09 就是後面這一筆，牆上的時間是訊號 K 棒，實際在 K 棒收盤 21:10 進場。

銜接：牆上那張圖卡裡放的就是實機錄影，鏡頭放大到剛好填滿畫面，所以從案例牆到實盤沒有剪接點。

## 分鏡（120 BPM，一小節 2 秒）

| 秒 | 畫面 | 聲音與情緒 |
| --- | --- | --- |
| 0–3 | 案例牆 30 張真實小圖翻面，鏡頭拉遠 | 琶音打開、大鼓進來 |
| 3–5 | **突然安靜**：其他圖卡失焦變暗，一張活過來，畫面去色、遮幅黑邊闔上，鏡頭慢慢推近後衝進去 | 音樂切斷，只剩殘響、低頻與心跳 |
| 5–7 | 真實盤面，已開的一筆，價格往線走 | 真實成交的滴答聲（高低音對應買賣方向） |
| 7–9 | 穿進足跡，**停損 −1R**，畫面再去色；賣單沒跟 | 停損的悶響，更安靜 |
| 9–11 | 再開一筆，顏色慢慢回來，黑邊收得更緊，最後價格慢速爬向目標 | 心跳加速、滾奏、上升音，爆發前 0.25 秒完全無聲 |
| 11 | **止盈 +2R：第一次爆發**（落在 A 和弦，12 秒解決到 Dm）：閃白、色散、震動、黑邊彈開、顏色過飽和 | 全樂團進來 |
| 12–16 | 甩鏡到盤面旁白（1 分 K），推近讀字，14 秒接一鍵覆盤（同一個盤面，K 棒不動） | 同一首歌：樂團退後但不離開、音色漸暗，讓眼睛讀字；14.5 秒起上升音、15 秒起滾奏帶回全樂團 |
| 16–21 | 清算熱力圖、掛單熱力圖、大額成交（各自在拍點上開啟）、足跡圖、連續失衡、副圖，越切越快 | 重拍回來，往上爬 |
| 21–23 | **第二次安靜**：全黑，一句「每一筆，都看得見。」；環繞在黑暗中往同一方向越轉越快、閃爍越來越快，以爆發時的轉速接進去 | 心跳、悶響、上升音、越來越密的滾奏，一路接到爆發，沒有無聲 |
| 23–27.4 | **第二次爆發**：12 個功能畫面分兩層反向旋轉，中央「訂單流軟體」 | 全片最大一下，加主旋律 |
| 27.4–28 | 全部被吸進中心 | 反向吸氣聲 |
| 28–30 | 標誌、metabear.io、揭露文字 | 和弦解決，三音動機收尾 |

錄影時對 lab 有幾個只在錄影瀏覽器裡的改動（`scripts/day-shot.mjs`）：隱藏回放控制列、「歷史回放中」和圖上的回放註記；平倉後的部位框留在圖上（網站目前只畫當前那一筆）。止盈停損仍由頁面依逐秒成交判定，`scripts/take-plan.mjs` 會和案例牆比對，不一致就中止。

## 重建

需要 Node 22、ffmpeg（`FFMPEG=` 可覆寫）、Playwright Chromium、python（numpy、scipy、fonttools）。在這個資料夾內。Git 只有程式；`assets/video/`（實機錄影）、`.tape/`（正式 API 與 WebSocket 錄音、`day.data.json`、`dive-log.json`）和混音都不進 Git。要完全重現同一支片，把這兩個資料夾從原機器複製過來，從 `node scripts/build.mjs` 開始。全部重錄的話，盤面旁白與功能畫面會換成重錄當時的行情。

```sh
node scripts/orderflow-data.mjs --from 2026-09-13 --to 2026-09-13 --out .data/orderflow/case-2026-09-13.json   # 在 repo 根目錄，9/14 同樣一次
node scripts/tape.mjs --ms 150000   # 錄一次正式 API 與 WebSocket 到 .tape/（不進 Git；重錄會換成當時的行情）
node scripts/build-day.mjs          # 9/14 整天的逐秒成交 → .tape/day.data.json（讀 repo 的 .data、.cache；worktree 用 MAIN_REPO= 指向主要 checkout）
node scripts/day-shot.mjs           # 先停損、再止盈那一鏡 → assets/video/dive.mp4，時間表 .tape/dive-log.json
node scripts/shots.mjs rail fp heat zones panes tools ex-all liq2 heat2 bubbles2   # 其他 lab 實機 → assets/video/
node scripts/build.mjs              # index.html、assets/audio/cues.json
python scripts/subset-font.py       # 改字後
python scripts/score.py             # 配樂與音效全部程式合成，沒有取樣，不需要授權 → assets/audio/soundtrack.wav
npx --yes hyperframes@0.8.149 render -q delivery -f 60 -o renders/final-30s.mp4
# 算圖會把這個專案的音軌壓低約 4 dB，所以最後換回原始混音：
ffmpeg -y -i renders/final-30s.mp4 -i assets/audio/soundtrack.wav -map 0:v -map 1:a -c:v copy -af "alimiter=limit=0.55:level=false:attack=1:release=30" -c:a aac -b:a 320k -shortest -movflags +faststart ../../out/platform-showreel-30s-v7.mp4
```

錄影都在 `bypassCSP` 的本機瀏覽器，用來隱藏字幕與提示、畫出游標。`.tape/` 與 `assets/video/` 不進 Git。
