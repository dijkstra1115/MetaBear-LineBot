---
workflow: general-video
flow: automation
storyboard: no
message: "帳面不是錢，平倉才是——排行榜前三名的真實對局"
destination: youtube
aspect: 1920x1080
language: zh-Hant + English
audience: 玩過或想玩 FLOW ARENA 排名賽的交易玩家
length: 48.3s
angle: real gameplay footage of the top three ranked games, cut tight to the user's song
---

## Intent

使用者看完 ../highlights（78 秒、資料重繪版）後要求：「再做一版是真實遊戲畫面的，然後節奏要再緊湊一點，時間太長了。」

## Footage

- `scripts/capture.mjs` 在真實的 /arena/ 頁面（public/arena）用排行榜紀錄的種子開排名賽，於每個動作紀錄的同一個 tick 套用同樣的操作，以虛擬時鐘逐格錄影（2880×1620 → 1080p，60 fps）。安靜段快轉、大事件放慢；結算後的成績面板以真實時間錄下。錄完比對頁面算出的最終損益與排行榜紀錄，必須完全一致。
- 錄影時封鎖所有非本機請求，不會上傳成績。

## Customizations

- 配樂：原曲第 4–15 小節（9.127–33.955 秒）接原曲第 39 小節（81.541 秒）之後，第 4 小節當作影片第 0 拍，116 BPM 小節網格從 0 秒開始；兩個抽空小節（影片第 3、12 小節）給 No.3 與 No.1；deyo 的 ×10 那一秒落在第一次爆發的重拍。片尾 46.3 秒起淡出。
- 字卡沿用 ../highlights 的視覺規則：帳面空心、帶走實心金色。

## Notes

- 玩家名稱是排行榜上的公開顯示名稱；不使用他／她等代名詞。
- 歌曲、混音與錄影檔不進 Git（見 ../.gitignore），重錄即可取得。
