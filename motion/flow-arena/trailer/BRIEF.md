---
workflow: general-video
flow: automation
storyboard: no
message: "一張單推動整個市場：讀燃料、上膛、引爆連環爆倉、在頂部落袋"
destination: youtube
aspect: 1920x1080
language: zh-Hant + English display type
audience: 對加密合約、訂單流有興趣的交易玩家
length: 45s
angle: gameplay-first game trailer × motion-design showreel
---

## Intent

FLOW ARENA（現役沙盤 `public/arena/`）的高能量宣傳片。使用者原話：一開場就是刺激的實機畫面，再疊上粗體動態圖像、動態字、快速轉場、UI 疊層、變速（speed ramp）與重擊特效；玩法畫面永遠是主角，質感要像頂級遊戲預告片混合 motion design showreel。

## Customizations

- 實機畫面以 `scripts/capture.mjs` 從本機 `/arena/` 逐格錄製：頁面跑在虛擬時鐘上（timer、rAF、performance.now、CSS 動畫都由錄影程式推進），所以 2880×1620 / 60fps 也不掉格。
- 主場景用種子 30：回合 1 以 5× 槓桿市價買入 5,000 BTC，推穿空單燃料，引爆 MEGA CASCADE，平倉落袋後市場反殺。數字全部來自實際錄到的畫面，不另外編造。
- 游標不在截圖裡；依錄影的游標紀錄在影片上重畫，hover／click 事件同時驅動音效。
- 配樂與音效全部用程式合成（`scripts/audio.mjs`），依剪輯表的 cue 逐格對齊。
- 變速：同一來源切成相鄰、不同固定速率的片段（來源時間連續），搭配推近、閃白與 RGB 分離，讀起來是 speed ramp。

## Notes

- 視覺 token 取自 `public/arena/arena.css`：bg #04070b、long #2de2a6、short #ff4f6e、fuel #ffad42、gold #ffd77a、violet #a98bff；字型 Barlow Condensed（展示）、JetBrains Mono（數字）、Noto Sans TC（中文）。
- 不宣稱不存在的功能：PvP 尚未推出，不出現；排行榜只說「排名賽 24 回合比總損益」。網址 metabear.io/arena，桌面版。
