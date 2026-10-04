---
message: "一張單推動整個市場：讀燃料、上膛、引爆連環爆倉、在頂部落袋"
audience: 加密合約／訂單流玩家
mode: autonomous
duration: 45s
tempo: 128bpm (beat 0.46875s, bar 1.875s), 24 bars
music: 自製合成 F 小調；開場全段 → 磁帶停止倒帶 → braam 標題 → 半拍 READ → 漸強 LOAD → 凍結 → 執行即 drop → 心跳張力 → CASH OUT 重擊 → 終段 → 23 小節終局 hit
concept: 實機畫面永遠是主角；同一段 5,000 BTC 推價從不同機位、不同速度反覆出現，字卡和 UI 標註只負責點出重點。
---

剪輯表與所有時間的單一來源是 `scripts/build.mjs` 的 `S`（鏡頭）、`OVERLAYS`、`HITS`、`WHIPS`。下面每格的時間以小節記。

## Frame 1 — Cold open
status: built
src: compositions/ov-open.html
start: 0 · duration: 4.6875
rules: kinetic-beat-slam, camera-punch-in, tape-rewind
beat: 直接從連環爆倉中段切入，一拍一刀（舞台、推價光束、連環計數 ×25、浮盈）；ONE / ORDER. / 5,000 / BTC / ×26 連環爆倉 / 浮盈 +$146,969,723；第 2 小節倒帶回到 09:00。

## Frame 2 — Title
status: built
src: compositions/ov-title.html
start: 4.6875 · duration: 2.8125
rules: chromatic-glitch, kinetic-beat-slam, light-sweep
beat: 遮幅黑邊、FLOW / ARENA 左右撞入、RGB 殘影、副標 LIQUIDATION HUNT · BTC 永續合約 · 爆倉獵場，推近後穿出。

## Frame 3 — 01 READ THE FUEL
status: built
src: compositions/ov-read.html
start: 7.5 · duration: 5.625
rules: camera-tracking-push, callout-brackets, counting-dynamic-scale
beat: 0.75× 實機讀圖；推近空單強平帶「他們的強平＝你的燃料」；燃料雷達特寫，1,867 / 1,672 BTC 計數，hover 鎖定上方。

## Frame 4 — 02 LOAD UP
status: built
src: compositions/ov-load.html
start: 13.125 · duration: 5.625
rules: cursor-hover-blips, stamp-slam, speed-ramp-into-freeze
beat: 數量鈕逐一 hover（登登登登，八分音符）鎖定 5,000 BTC；5× 槓桿、預估推價、LONG 印章；PULL THE TRIGGER 三拍；點「執行回合」凍結一拍。

## Frame 5 — 03 IGNITE
status: built
src: compositions/ov-ignite.html
start: 18.75 · duration: 11.25
rules: speed-ramp, split-screen-triptych, live-data-ticker, impact-shake
beat: drop＝推價光束；IGNITE；即時行情條（價格／連環／引爆 2,240 BTC／浮盈）；三分割同一瞬間；MEGA CASCADE 與漲幅；峰值慢動作；心跳「TAKE IT OR RIDE IT?」。

## Frame 6 — 04 CASH OUT
status: built
src: compositions/ov-cash.html
start: 30 · duration: 5.625
rules: kinetic-beat-slam, counting-dynamic-scale
beat: 平倉落袋與金幣；總損益 +$74,060,257；「你一出場——市場就崩了。」即時跌幅；回合戰報「完美點火」。

## Frame 7 — Modes
status: built
src: compositions/ov-compete.html
start: 35.625 · duration: 3.75
rules: rise-reveal
beat: 揭曉的真實強平地圖（SEE THE MAP）；排名賽 RANKED · 24 TURNS。

## Frame 8 — CTA
status: built
src: compositions/ov-cta.html
start: 39.375 · duration: 5.625
rules: spring-pop-entrance, light-sweep, final-hit
beat: 連環爆倉畫面退到背景；MetaBear 徽章、FLOW ARENA、推動市場，引爆槓桿。、metabear.io/arena；第 23 小節終局 hit。
