---
workflow: general-video
flow: automation
storyboard: no
message: "OI 看倉位開或平，CVD 看誰先出手；兩個一起看，才知道誰被困住"
destination: threads
aspect: 1080x1920
language: zh-Hant
audience: 台灣幣圈交易者，想學訂單流的人
length: 65s
angle: the same 2025-12-09 trade as motion/replays/2025-12-09, told through the logic behind each reading instead of the course's checklist
voice: gemini-tts-charon
---

## Intent

2026-10-13 使用者：「想嘗試看看不同風格，不要用確認一二三這種課程用語，而是講數據可能代表的底層邏輯，例如：OI 雖不能判斷多空，但這時 CVD 顯示主動賣量增加，代表多倉強平的可能性更高……希望你可以保留這部影片，重新設計一個腳本與課程動畫。Show me what an incredible motion graphic designer you are, go all out! You can use any tool you want, like Three.js, GLSL Shader, GSAP, p5.js, SVG etc… 配音試試看 Elevenlabs 的配音。」

選定方向（自動流程內部比稿）：「倉位是看得見的物質」——每 1 BTC 未平倉是一對綁在一起的多空光點，OI 增減就是點對倒進池裡或被拆開；主動單是彗星；2×2「訂單流羅盤」貫穿全片。刻意不走的方向：TradingView 截圖加箭頭的常見教學片，以及課程版的策略軌勾選。

腳本、數據核對表與視覺概念：[docs/REPLAY-2025-12-09-OI-LOGIC.md](../../../docs/REPLAY-2025-12-09-OI-LOGIC.md)。

## Assets

- `../../../.data/orderflow/btcusdt-oos.json` → `scripts/extract.mjs` → `assets/data/case.json`（OI 已做 5 分鐘對齊，見核對文件）。
- `assets/img/badge.png` — MetaBear 正式 Logo。字型沿用課程版（Noto Sans TC 子集、Barlow Condensed、JetBrains Mono）。

## Customizations

- 2026-10-13 第二版（使用者看過 v1 後）：
  - 改成**專業交易終端**風格：單一 2D 畫布（程式未保留），細格線、等寬數字、價格與 CVD 兩個面板共用一個會移動的時間視窗。不用光暈、粒子和 3D。
  - 開場回到原版的反差：「跌破前低，反而是做多訊號？」，跌破畫面硬切到兩個目標達成。
  - 刪掉 OI 原理講解。OI 只在 12:35（+1,040）與 13:30（−902）用大數字警示卡出現。
  - **CVD 當主角**：獨立面板，標出 13:17→13:28 的背離（CVD 新低、價格沒破底）。不再用大戶持倉多空比。
  - **英文旁白**：ElevenLabs `eleven_v3` Brian，加速 1.1 倍，繁中字幕是翻譯。
- 2026-10-13 第三版（使用者看過 v2 後）：腳本、英文配音與內容維持 v2，**設計感與鏡頭語言改回課程版 v3**（`replay-2025-12-09-preview-v3.mp4`）：3D 空間裡的價格平面、CVD 平面、足跡平面，攝影機推近、俯衝、穿越，數據卡飛出時背景景深模糊，K 棒展開成分鐘，入場落針，目標打勾加衝擊環。**不要**上方的「地點／事件／確認／執行」策略軌與勾選槽。程式在 `src/templates/index.html`。
- 2026-10-13 第四、五版：足跡不再另開平面，改成推近那根 K 棒、在原地展開（13:17、15:20）；5 分 K 與 1 分 K 之間改成同一個視窗連續縮放，5 分 K 原地拆成 5 根 1 分 K（回去時收合），並加上「5 分 K｜1 分 K」切換鈕與時間刻度；結果段接近目標時放慢，兩個目標各自打勾、各響一聲。
- 2026-10-13 第五版：配音改回**中文**，用課程版 preview-v2 的男聲（Gemini TTS **Charon**、沉穩解說），分兩段錄（`scripts/voice.py`），`scripts/split-vo.py` 用 Whisper 對時、對齊停頓切成各段。英文 Brian 版旁白與試聽檔已在 2026-10-14 刪除（只保留最終版）。
- 2026-10-13 第六版：使用者覺得 v5 語音太快、少了情緒（這次錄音的停頓只占 15–25%，課程版 26–35%）。先不重錄：取消 1.1 倍加速（`SPEED = 1.0`），在每個推論前用 `pauses` 補 0.2–0.45 秒停頓（`scripts/split-vo.py` 在最安靜的取樣點插入靜音），段落間空檔拉長。若仍覺得平，再用新的導演指示重錄。
- 2026-10-13 第七版：v6 補的停頓有一處切在「是｜新空單」中間，所以改用新的導演指示整段重錄（開場問句帶好奇、冒號後先換氣再揭曉、數字放慢；`pauses` 全部清空）。重錄後第 1 段停頓占比由 15% 升到 30%。目標到達後不再講 OI／CVD 總結，直接接「完整課程，在 MetaBear 學院」，片尾卡同步改為「完整課程」。鏡頭移動的呼嘯聲使用者確認要保留。第一次的錄音已刪除；第二次錄音的第 2 段留在 `assets/audio/vo-take2/`，結尾那句仍在使用。
- 2026-10-14 第八、九版：呼嘯聲原本幾乎無聲（窄頻濾波＋音量太低，課程版同一段程式也一樣），改成 2.5 倍頻程寬頻並調到事件音的音量。回測段不用課程的「連續兩格失衡」，改講「連續 6 個價位主動買都在 20 顆以上」，進場改成等下一根回到這根成交最多的 90,300 這一格（金色光帶標註），15:29 以 90,310 進場。第 2 段第三次重錄；第三次把 MetaBear 唸成「梅塔貝爾」，結尾那句改用第二次的錄音（`scripts/split-vo.py` 的 `OVERRIDES`）。使用者表示這是最後一次重錄。
- 配色沿用品牌：深墨底、薄荷綠＝買方、琥珀＝賣方、暖金＝重點、OI 米灰。
- 不加顆粒、掃描線、倒帶等雜訊特效；配樂與音效程式合成，風格克制。
- v1（Three.js 未平倉池、中文 Will 旁白，107.8 秒）與 v2（2D 交易終端、英文 Brian）沒有進 Git，草稿影片也已刪除；最終成品在 `motion/out/replay-2025-12-09-oi-logic.mp4`（不進 Git）。

## Notes

- 不講口號、不提回測、不談勝率與報酬金額；結尾導向 MetaBear 學院與 metabear.io。
- 片中所有數字都要在核對文件找得到出處；推論用「很可能」。
- 旁白是 Gemini TTS（使用者表示只用於非商業用途）；公開發布前要再確認。

## 製作流程

1. 改 `scripts/script.mjs` → `python scripts/voice.py [段]`（Gemini 一天約 5 次）→ `python scripts/split-vo.py`（各段音檔與逐字時間 `scripts/.align/`）。
2. `node scripts/build.mjs`（產生 `compositions/*.html`、`index.html`）→ `python scripts/subset-font.py`。
3. `node scripts/mix.mjs`（`assets/audio/vo.wav`、`assets/audio/score.wav`）。
4. `npx --yes hyperframes@0.8.152 check`，再 `snapshot`、`render -q draft`。
