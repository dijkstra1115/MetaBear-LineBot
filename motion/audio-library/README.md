# motion/audio-library/ — 音樂、音效與人聲素材庫

所有影片專案共用的聲音素材集中在這裡。這個資料夾除了本 README 之外都不進 Git（見 repo 根目錄 `.gitignore`）：歌曲是使用者提供或另外取得授權的，下載音效不能經由 Git 再散布，人聲試聽檔重新生成每次都不同。

**專案不會讀這裡的檔案。** HyperFrames 專案的預覽與渲染只能讀自己資料夾內的檔案，所以每個專案用到的聲音仍放在專案自己的 `assets/audio/`；這裡是「母帶」與總目錄。新專案要用某首歌或某個音效時，從這裡**複製**進專案的 `assets/audio/`，並在專案的 `.gitignore` 排除它。

## music/ — 歌曲

| 檔案 | 內容／來源 | 用在 | 授權／備註 |
| --- | --- | --- | --- |
| `ensena-a-amar.mp3` | 「ENSEÑA A AMAR」320k，原檔名 `ENSEÑA A AMAR_320k.mp3`（原本散放在 `motion/`） | flow-arena/highlights、highlights-live（專案內複本 `assets/audio/song.mp3`） | 使用者提供，不進 Git |
| `montagem-pegadora-slowed.mp3` | 「MONTAGEM PEGADORA (Slowed)」320k，原檔名 `MONTAGEM PEGADORA (Slowed)_320k.mp3`（原本散放在 `motion/`） | academy-drop（專案內複本 `assets/audio/song.mp3`） | 使用者提供，不進 Git |
| `raya-sped-up.mp3` | 「Raya (Sped Up)」，從 `flow-arena/surge/assets/audio/raya.mp3` 複製 | flow-arena/surge、surge-916（專案內各有 `raya.mp3`；surge 另有解碼後的 `raya.wav`） | 使用者提供、已取得授權，不進 Git |

## sfx/ — 音效

### sfx/downloads/ — 使用者下載的音效

從 `academy/film/assets/audio/sfx/` 複製（專案內那份才是 academy-film 實際讀取的）。只放本機、不進 Git。

| 檔案 | 內容 | 用在 |
| --- | --- | --- |
| `sub-drop.mp3` | 低頻下沉 | academy-film |
| `whoosh-deep.mp3` | 低沉呼嘯轉場 | academy-film |
| `whoosh-bass-drop.mp3` | 呼嘯接低音重擊 | academy-film |
| `ui-thud.mp3` | 介面悶擊 | academy-film |
| `ui-connection.mp3` | 介面連線提示音 | academy-film |

### sfx/lab/ — 程式合成的試做音效

`academy/film/scripts/sfx-lab.mjs` 的輸出（原本在 `motion/out/sfx-lab/`，腳本已改寫到這裡）。每個都有 wav 與 mp3。

| 檔案 | 內容 |
| --- | --- |
| `bubbles-1-accelerate` … `bubbles-5-rubber` | 「全部擠在一起」那一下的悶泡泡聲候選，2 秒累積後落在一個軟擊 |
| `ui-1-tap` … `ui-5-glass` | 介面點擊／切換／彈出／選取／玻璃聲候選（四下連續，間距同片中） |
| `aether-ref-7.9-9.8` | 參考片 `motion/out/ref/aether.mp4` 7.9–9.8 秒的原聲片段，用來對照 |

其他音效都是各專案腳本即時合成、直接混進 `soundtrack.wav`，沒有單獨的檔案（見下方「各專案的混音」）。

## voice/ — 人聲

### voice/samples/ — 旁白聲線試聽

原本在 `motion/out/voice-samples/`。選定的是 Gemini 3.8 Flash TTS 的 **Algenib**（academy-voice、academy-film 都用它）。

| 檔案 | 內容 |
| --- | --- |
| `gemini-<聲線>.mp3`、`gemini-line-<聲線>.mp3` | Gemini TTS 聲線比較：Algenib、Charon、Enceladus、Gacrux、Orus（整段／單句） |
| `adam`、`brian`、`daniel`、`george`、`deep-A…D-*`、`all-four.mp3` | 另一家 TTS 內建聲線的試聽（推測是 ElevenLabs），未採用 |
| `v2/A-algenib-deeper`、`v2/B-algenib-minus1st`、`v2/C-gacrux` | academy-film 旁白的替代錄音（wav＋mp3），由 `academy/film/scripts/voice-options.py` 產生（腳本已改寫到這裡） |
| `gemini.py` | 產生上面 `gemini-*.mp3` 的一次性腳本；在 `motion/` 底下執行，需要 `motion/.env` 的 `GEMINI_API_KEY` |

### voice/lab/ — 旁白處理鏈試聽

`academy/film/scripts/voice-lab.sh` 的輸出（原本在 `motion/out/voice-lab/`，腳本已改寫到這裡）：開頭約 12 秒旁白套不同處理鏈。`0-current`、`A-chest-eq`、`B-chest-eq-minus-half-semitone`（使用者選的）、`C-chest-eq-minus-one-semitone`。

## 留在專案裡的聲音（只列位置，沒有複製）

這些是各專案自己的定稿旁白或混音，換專案沒有用處，或者會被專案直接讀取，所以不搬也不複製：

| 位置 | 內容 | 進 Git |
| --- | --- | --- |
| `academy/voice/assets/audio/vo-raw.wav` | academy-voice 定稿旁白（Gemini Algenib） | 是 |
| `academy/film/assets/audio/vo-raw.wav`、`takes/line1-*.wav` | academy-film 定稿旁白與第一句重錄（用 take 3） | vo-raw 與 take 3 是 |
| `academy/drop/assets/audio/soundtrack.wav` | academy-drop 混音（含歌曲） | 否 |
| `academy/voice/assets/audio/soundtrack.wav`、`academy/film/assets/audio/soundtrack.wav` | 旁白＋合成音效的混音 | 否 |
| `flow-arena/launch/assets/score.wav`、`flow-arena/gameplay/assets/score.wav` | 合成配樂（`audio-src/score.py`） | 是 |
| `flow-arena/promo/assets/audio/soundtrack.wav`、`flow-arena/trailer/assets/audio/soundtrack.wav` | 合成配樂與音效（`scripts/audio.mjs`） | 是 |
| `flow-arena/surge/assets/audio/soundtrack.wav`、`flow-arena/surge-916/assets/audio/soundtrack.wav` | Raya 剪接混音 | 否 |
| `flow-arena/highlights*/assets/audio/soundtrack.wav` | ENSEÑA A AMAR 剪接混音 | 否 |
| `flow-arena/flagship` → `motion/out/flow-arena-flagship.wav` | 旗艦廣告合成配樂（`audio/score.mjs` 產生，目前不在本機） | 否 |
| `public/orderflow/motion/audio/<id>.m4a` | 學院課程配樂（`npm run motion:audio`），網站直接播放 | 是 |
