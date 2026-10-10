---
workflow: general-video
flow: automation
storyboard: no
message: "帳面不是錢，平倉才是——排行榜前三名的真實對局"
destination: youtube
aspect: 1920x1080
language: zh-Hant + English
audience: 玩過或想玩 FLOW ARENA 排名賽的交易玩家
length: 47.9s
angle: real gameplay footage of the top three ranked games, cut to "Raya (Sped Up)"
---

## Intent

使用者看完 ../highlights-live 後要求：「用這個音樂再做一版」，音樂是 ../surge/assets/audio/raya.mp3（「Raya (Sped Up)」，使用者提供、已取得授權，不進 Git）。畫面、剪接與字卡沿用 highlights-live，只依新歌重新對拍。

## Customizations

- Raya 116.55 BPM，第一個下拍 0.50 秒，1 小節 2.059 秒。剪法：原曲第 0–11 小節 → 第 15 小節（爆發前的抽空，給 No.1）→ 第 20 小節（全曲最重的一拍）之後；兩個剪接點前後和聲相似度 0.96–0.98。影片小節編號與 highlights-live 相同，片尾落在原曲第 28–29 小節的安靜段，46 秒起淡出，總長 47.9 秒。
- 開場改依新歌：第 0 小節重拍上四個預告鏡頭，第 1 小節歌曲抽空時打標題，第 2 小節再四個預告，第 3 小節 No.3 倒數。

## Footage

錄影與 highlights-live 相同（assets/video，由 scripts/capture.mjs 錄製；不進 Git）。

## Notes

- 玩家名稱是排行榜上的公開顯示名稱；不使用他／她等代名詞。
- 歌曲、混音與錄影檔不進 Git（見 ../.gitignore）。
