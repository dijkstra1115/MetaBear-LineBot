---
workflow: general-video
flow: automation
storyboard: no
message: "帳面不是錢，平倉才是——排行榜前三名，帳面最少的人帶走最多"
destination: youtube
aspect: 1920x1080
language: zh-Hant + English
audience: 玩過或想玩 FLOW ARENA 排名賽的交易玩家
length: 78s
angle: broadcast instant-replay package rebuilt from replay data, cut to a licensed-by-user song
---

## Intent

使用者要求：「直接做」宣傳片，把排行榜前三名的精彩集錦包裝起來，用 `motion/audio-library/music/ensena-a-amar.mp3` 當背景音樂，「go all out」。

畫面不是錄影，而是用 Cloudflare D1（metabear-arena-production）抓到的種子與操作紀錄，透過 `public/arena/engine` 逐秒重播三局，再把價格、部位、損益、強平波畫成影片。三局的重播結果都與資料庫的成績完全一致（scripts/export.mjs 會檢查）。

## Story

- 前三名的帳面最高點與最後成績剛好顛倒：deyo 帳面 330.98 億 → 22.80 億；easy_yu 189.02 億 → 29.15 億；劉孟孟 78.39 億 → 41.66 億。
- 倒數排名：#3 → #2 → 鐘響強制平倉 → #1 → 結論 → 行動呼籲。

## Customizations

- 配樂 116 BPM，下拍 0.851 秒起每小節 2.069 秒。剪法：原曲 0–50.506 秒，接原曲 81.541 秒（第 39 小節的抽空）之後，第二次爆發落在影片 52.575 秒；兩個抽空小節分別給「No.3」與「No.1」。片尾 75.4 秒起淡出，總長 78 秒。
- 視覺：運動轉播的即時重播包裝。帳面損益一律畫成空心描邊，平倉後的已實現損益一律是實心金色：整支片用「空心 vs 實心」說同一件事。

## Notes

- 排名賽規則依 public/arena/engine/ranked.js：24 回合 × 300 秒；時間到先取消所有委託，再以市價平掉剩餘部位，成績是已實現損益扣手續費。
- 價格單位：引擎以美分記價，畫面一律換成美元；1 口 = 0.01 BTC。
- 玩家名稱是排行榜上的公開顯示名稱；不使用他／她等代名詞。
- 歌曲與含歌曲的混音不進 Git（見 ../.gitignore）。
