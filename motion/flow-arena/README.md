# FLOW ARENA 宣傳片（HyperFrames）

FLOW ARENA 宣傳影片的原始專案。launch／gameplay／promo／trailer 是 HyperFrames 專案；flagship 是自己的程式化管線（Canvas 2D + CPU 後製 + 合成配樂）。每個資料夾都能獨立預覽與渲染；需要 Node.js 22+。

| 專案 | 內容 | 規格 |
| --- | --- | --- |
| launch/ | 第一版上市 sizzle：爆倉熱圖、推價、連環強平（英文） | 16:9，約 45 秒 |
| gameplay/ | 第二版玩法 reel：下大單、假突破、連環爆倉、冰山試探、反手，含 3D 翻轉與實機結算（英文） | 16:9，60 秒 |
| promo/ | 第三版繁中宣傳片：限價吸收、薄簿突破、連環爆倉、好友對戰，加實機玩法錄影與結算 | 16:9，67.5 秒 |
| trailer/ | 第四版高能預告：現役沙盤（/arena/）逐格實機錄影為主，5,000 BTC 推價引爆 MEGA CASCADE、變速、三分割、動態字與 UI 標註（繁中＋英文） | 16:9，45 秒，60fps |
| [flagship/](flagship/README.md) | 正式上線旗艦廣告（現行沙盤）：人群與燃料、推價與冰山、計畫／揭曉／執行、五級連環強平、帳本守恆、排名賽（英文主標、繁中副標） | 16:9，60 秒，60 fps |

各專案的意圖與分鏡在自己的 BRIEF.md、STORYBOARD.md。專案內的 `id`／`name`（meta.json、package.json）仍是原本的 `flow-arena-launch` 等。

## 常用指令（launch／gameplay／promo／trailer，在專案資料夾內；flagship 見它的 README）

```powershell
npm run dev      # Studio 預覽
npm run check    # lint + 版面 + 對比
npm run render   # 輸出到 renders/
```

promo 另有：

- `node scripts/audio.mjs`：依各場景的 cue 重新合成配樂與音效（assets/audio/soundtrack.wav）。
- `python scripts/build-index.py`：依場景清單重寫 index.html 時間軸。
- `python scripts/subset-font.py`：改文字後重新裁切 Noto Sans TC（完整字型放在被忽略的 scripts/font-src/）。
- `node scripts/capture-gameplay.mjs <dir>`：重錄實機玩法影片與結算畫面（需 `npm run preview:academy`）。錄的是舊版 120 秒獵場（origin/flow-arena 的 challenge.html）；新的沙盤在 /arena/，畫面與玩法不同。

trailer 的流程（在 trailer/ 內，需 `npm run preview:academy`）：

1. `node scripts/capture.mjs main|reveal|ranked`：用虛擬時鐘逐格錄現役沙盤（2880×1620、60fps），同時寫下游標與遊戲數值紀錄（assets/video/*.json）。種子 30 的結果是決定性的，重錄得到同一段行情。
2. `node scripts/build.mjs`：依剪輯表產生 index.html（鏡頭、推近、變速、游標）、把共用 kit 與遊戲數值注入 compositions/ov-*.html，並寫出音效 cue（assets/audio/cues.json）。
3. `node scripts/audio.mjs`：依 cue 合成配樂與音效（預設低沉渾厚版；加 `--bright` 重建第一版明亮混音）；`python scripts/subset-font.py`：改字後重新裁切中文字型。

## 不進 Git

renders/、snapshots/、.thumbnails/、.hyperframes/ 等渲染輸出與快取只存在本機（見 .gitignore）。重新渲染即可取得；已完成的成品集中放在 `motion/out/flow-arena-*.mp4`。
