---
workflow: general-video
flow: automation
storyboard: no
message: "互動學院不是看完就算：按下播放、拖回重看、親手下單、立刻對答案，然後拿到成績。"
destination: youtube / 網站
aspect: 1920x1080
language: zh-Hant + English display type
audience: 對加密合約、訂單流有興趣的交易學習者
length: ~30s
angle: beat-cut product-launch promo on a user-supplied track
---

## Intent

使用者原話：Create a high-energy promo video for 互動學院. Open with an engaging interactive learning moment,
then showcase hands-on challenges, real-time feedback, and learner achievements. Use bold kinetic typography,
sleek UI overlays, and punchy transitions. Keep the learning experience front and center, with the polish and
excitement of a premium product launch. 配樂用 `motion/MONTAGEM PEGADORA (Slowed)_320k.mp3`，剪接、字與轉場對拍，
能量一路堆到主 drop。

選擇：16:9、約 30 秒、剪短前奏、直接做完不審分鏡。

## Assets

- 歌曲：`motion/MONTAGEM PEGADORA (Slowed)_320k.mp3`（使用者提供，複製到 assets/audio/song.mp3，不進 Git）。
- 課程畫面：`scripts/capture.mjs` 從本機 `npm run preview:academy` 逐格錄製真實課程頁（播放器、章節、回拖、本課完成）與課程地圖。
- 實機畫面：沿用 `../flow-arena/surge/assets/video/` 的 FLOW ARENA 沙盤錄影（main／reveal／ranked）。

## Customizations

- 歌曲 100.06 BPM（1 拍 0.5997 秒、1 小節 2.3986 秒），第一個強拍 0.065 秒。
  剪法：歌曲第 0–1 小節 → 第 5 小節（前奏最後一小節，有上揚）→ 第 6–15 小節照原樣。
  影片第 11 小節（26.45 秒）＝歌曲第 14 小節全曲最重的 808；前一拍（25.85 秒）歌曲本身整拍靜音。
- 視覺：學院深色介面＋薄荷綠，真實 UI 放在浮空螢幕裡，粗黑體繁中＋Barlow Condensed 英文大字。

## Notes

- 只講學院真的有的功能：約 30 秒一堂、隨時暫停回拖、章節、23 堂課、四條學習路線、本課完成；
  FLOW ARENA 沙盤的下單、執行回合、揭曉對答案、連環強平、排名賽 24 回合。不出現 XP、徽章等不存在的系統。
- 課程為交易概念教學，不提供個人買賣建議或獲利保證；沙盤為模擬市場。
