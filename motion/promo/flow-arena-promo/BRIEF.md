---
workflow: general-video
flow: automation
storyboard: no
message: "你的資金大到能推動市場——吸收、突破、引爆連環爆倉，120 秒獵場裡你是獵人也是獵物"
destination: youtube
aspect: 1920x1080
language: zh-Hant
audience: 對加密合約、訂單流有興趣的交易玩家
length: 50s
angle: gameplay-first showreel
---

## Intent

FLOW ARENA（MetaBear 互動學院的 BTC 永續合約爆倉獵場）遊戲廣告宣傳片。使用者要求 "go all out"、像 motion designer 的 showreel。

專家建議（使用者原話整理）：
1. 一開始就用實際遊戲畫面讓觀眾看到內容與玩法（局部即可，避免元件太多勸退）：限價吸收操控價格、趁訂單簿變薄時低成本市價突破、獵取流動性引發連鎖爆倉等。
2. 滑鼠滑過價格或按鈕等 UI 元件時，發出較高頻的「登登登登」音效。

## Customizations

- 以遊戲真實配色／元件（K 線、爆倉熱圖、委託簿、下單列、爆倉跑馬燈、對手強平區）在 HTML 中局部重建，而非整頁截圖。
- 虛擬游標驅動：每次滑過價格階梯／按鈕觸發上升音階的 hover blip。
- 音樂與音效全部以程式合成（決定性、與畫面逐格對齊），不使用外部供應商。

## Notes

- 視覺 token 取自 public/orderflow/challenge.css 與 flow-arena-chart.js（bg #08121b、mint #70e6c9、coral #fb7f91、amber #f2c575、熱圖 rgb(92,64,170)→rgb(255,214,102)、對手強平區 #b79cff）。
- 不宣稱不存在的功能或網址；PvP 為「好友對戰」開房。
