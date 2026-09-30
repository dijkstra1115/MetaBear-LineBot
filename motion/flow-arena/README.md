# FLOW ARENA 宣傳片（HyperFrames）

三支 FLOW ARENA 宣傳影片的 HyperFrames 原始專案。每個資料夾都能獨立預覽與渲染；需要 Node.js 22+。

| 專案 | 內容 | 規格 |
| --- | --- | --- |
| launch/ | 第一版上市 sizzle：爆倉熱圖、推價、連環強平（英文） | 16:9，約 45 秒 |
| gameplay/ | 第二版玩法 reel：下大單、假突破、連環爆倉、冰山試探、反手，含 3D 翻轉與實機結算（英文） | 16:9，60 秒 |
| promo/ | 第三版繁中宣傳片：限價吸收、薄簿突破、連環爆倉、好友對戰，加實機玩法錄影與結算 | 16:9，67.5 秒 |

各專案的意圖與分鏡在自己的 BRIEF.md、STORYBOARD.md。專案內的 `id`／`name`（meta.json、package.json）仍是原本的 `flow-arena-launch` 等。

## 常用指令（在專案資料夾內）

```powershell
npm run dev      # Studio 預覽
npm run check    # lint + 版面 + 對比
npm run render   # 輸出到 renders/
```

promo 另有：

- `node scripts/audio.mjs`：依各場景的 cue 重新合成配樂與音效（assets/audio/soundtrack.wav）。
- `python scripts/build-index.py`：依場景清單重寫 index.html 時間軸。
- `python scripts/subset-font.py`：改文字後重新裁切 Noto Sans TC（完整字型放在被忽略的 scripts/font-src/）。
- `node scripts/capture-gameplay.mjs <dir>`：重錄實機玩法影片與結算畫面（需 `npm run preview:academy`）。

## 不進 Git

renders/、snapshots/、.thumbnails/、.hyperframes/ 等渲染輸出與快取只存在本機（見 .gitignore）。重新渲染即可取得；已完成的成品集中放在 `motion/out/flow-arena-*.mp4`。
