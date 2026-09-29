# Preview 音訊 A／B 診斷

入口：https://preview.metabear.io/audio-test/

2026-09-29 部署版本：faab5ed5-ead9-4379-aac1-5a46e35f1ab8（修正版課程 + v1–v4 診斷）。
可回復的原 preview 版本：1170b62e-3eb6-4223-a1e9-47b08638f305。

此資料夾在 public 之外，不隨正式網站建置。修正版 player.js 已部署正式站；原版 A/B 基準固定於 player-baseline.js（整理分支 1371711 原文）。

## 修正版 Preview

入口：`https://preview.metabear.io/audio-fix/orderflow/btc-wall.html`；可用左側選單切換全部 19 堂課。

`src/lesson-audio.ts` 處理限定課程音檔的 GET/HEAD/單段 Range/If-Range/416。完整回應沿用來源串流；已知長度的分段回應僅讀到所需結束位置並取消來源。Workers Assets 內部回應若省略 Content-Length，Range 請求會先以 2 MiB 上限讀取音檔、取得實際長度，再提供分段回應；現有最大檔案 812569 bytes。production 與本機 preview 路由共用此 helper。線上修正版 overlay 從既有正式公開音檔取 bytes，其他 preview 路由與 ArenaRoom 保持原文與綁定。

`audio-transport.js` 讓動畫以音訊 currentTime 為準；只有使用者操作才改音訊位置。開聲音時先確認 seekable，等待跳轉完成再解除輸出靜音，並在使用者點擊當下呼叫 play 以保留行動瀏覽器手勢。跳轉失敗或超時顯示重試，不反覆 seek。暫停作廢舊的 play 拒絕回呼；音訊結束後允許動畫短尾段完成。音檔加 audio_v=2 避免沿用舊傳輸回應。

驗證：117 個專案測試（98 TypeScript + 19 academy）及 10 個診斷測試通過，typecheck/build:site 通過。HTTP 分段 100000–101023 實際回 206／1024 bytes，Content-Range 與 Accept-Ranges 正確。桌面瀏覽器首次在約 19 秒開聲音後，音訊 19.154／畫面 19.14 秒；暫停、回頭、章節跳轉、播完、重播及切換 footprint 正常，無主控台錯誤。使用者其後回覆「都正常了」，確認 Windows、iPhone/iPad Preview 驗收。

## 正式部署（2026-09-29）

正式版本：`a3fbbcb7-6418-4c7c-a871-ec3155a850d8`，100% 流量；可回復版本：`926928b6-cd55-42ef-bc9d-d11ddf440afc`。

透過 Cloudflare 插件上傳並部署。291 個正式資產中只有 player.js 更新、audio-transport.js 新增。現役 index.js 原文保留，production.mjs 僅針對課程音檔包裝 ASSETS.fetch，委派原本的路由與安全標頭；scheduled、queue、19 個 bindings 及 runtime 設定均核對一致。正常原始碼建置則在 src/index.ts 直接套用等效 helper，無需此部署轉接模組。

第一個候選 d413d041 的正式 HTTP 驗證發現 Workers Assets 內部缺少 Content-Length，與 Preview 公開 HTTP 來源不同，分段未生效；已先回復原版，再補上有大小上限的長度推算。新增未知長度、多 chunk、suffix range 與超限取消測試；5 個音檔 handler 測試、typecheck、10 個診斷測試通過。Preview 舊資產不包含這批音檔，因此線上 Preview 維持使用公開來源，版本回復至已驗收 faab5ed5。

正式部署後全部 19 個音檔以新查詢網址請求 bytes=100000-101023，均回 206、1024 bytes、正確 Content-Range／Accept-Ranges，內容與本機對應區段完全一致。兩個播放器檔案亦與本機逐 byte 相同。首頁、health、BTC 課程回 200，admin 仍導向登入。正式瀏覽器首次開聲音並跳至第三章：音訊 19.123759／畫面 19.100 秒，seekable 0–54.8、未靜音、播放中、無 media error。

Preview 原模組內容及 bindings 保持保留。修正、測試與診斷紀錄一併納入版本控制；部署憑證及產生的模組保留在 Git 忽略的 .wrangler 目錄。

## 比較方式

A 保留播放中的 0.12 秒漂移校正；B 僅停用該自動 seek。
兩者皆使用目前正式站相同的課程、繪圖程式與原始音檔，啟動時強制靜音且使用獨立 localStorage key。
音檔直接來自 metabear.io；其餘資源經限定公開路徑的 proxy 載入。因此載入／快取条件和正式入口仍有差別，不能單靠這個測試判定首次載入問題。
資料僅 postMessage 至同源父頁顯示，不傳回伺服器。B 可能聲畫不同步，並非正式修復。
切換模式時整頁重載，只啟動一個課程。請以 A→B 與 B→A 比較，並複製每次數據及回報裝置／瀏覽器。

v2 新增 `?mode=A&cache=fresh` / `?mode=B&cache=fresh`：每次頁面載入使用不同 audio_test 查詢參數，減少重用瀏覽器的音檔快取。已確認加參數與原始音檔 SHA-256 相同。此方式不代表清空整個瀏覽器／解碼器或 CDN 快取。
輸出加入前 30 個啟動事件（sound-on、play、playing、seeking、seeked、waiting 等），含 buffered 與 seekable 範圍。正常網址模式維持既有行為。這些資料不會傳往伺服器。

使用者回報：iPhone A 斷續而 B 正常；A 約 54 秒內 145 次自動 seek，0 次超過 100ms 畫面。Windows Chrome 原測試 A／B 皆正常，但正式課程無痕首次有雜音、關聲再開無效、重整或離開後回到同課恢復。桌面原因仍待 v2 首次載入對照，不能從重整改善就斷言快取或解碼錯誤。

## v3 傳輸對照

入口：`/audio-test/?experiment=transport&transport=original`，另一組為 `transport=range`。
兩組都停用每幀校正，同樣從靜音開始、自動停在動畫 10 秒。使用者按課程內的開始聲音按鈕後，請求音訊從 10 秒播放；5 秒後僅一次請求跳至 20 秒，再於啟動後 12 秒結束。輸出 `audio-transport-v3`，probe.commands 記錄要求的位置，probe.samples 記錄一秒後实际位置及範圍。

為隔離傳輸變因，兩組都經同一 preview Worker、相同來源、相同完整位元組載入與 no-store 策略。original 組刻意忽略 Range 並回傳 200 整檔，模擬目前正式站行為；range 組支援單一 byte range、206、416、HEAD、If-Range。這不是直接量測正式網站的下載速度，不能將耗時差異當成 CDN 結論。
端點只允許 btc-wall、footprint 音檔，不轉送 cookie／授權資料，單檔上限 2 MB。正式發布前應另外評估有效率的儲存／分段傳輸方案；此端點會完整讀取小型音檔以服務診斷。

HTTP 驗收：要求 bytes=100000-101023，original 回 200／812569 bytes，range 回 206／1024 bytes，Content-Range 正確。两組整檔 SHA-256 與正式音檔一致，片段位元組完全吻合。8 個診斷測試通過。

桌面內建瀏覽器實測（btc-wall，兩組都完成）：original 要求從 10 秒播放及跳到 20 秒，一秒後音訊位置都只有約 0.94 秒；range 對應為 10.76 秒與 20.93 秒，seekable 為 0–54.8 秒。兩組 automaticSeeks 皆為 0、seeking 皆為 2。此對照支持不支援 Range 會造成此環境的跳轉失敗，尚待使用者 Windows Chrome／iOS 實測；工具未驗證主觀聽感。

使用者操作：Chrome 無痕開啟 original 入口，保持分頁在前景，等動畫停在 10 秒後按「開始聲音測試（10 秒）」一次；等顯示完成，複製數據並記錄雜音／斷續情況。切換「2 · 支援分段下載」重做，回傳兩組數據。兩組都關閉反覆自動 seek，所以原始組不一定仍有雜音；須一併比較實際跳轉位置。

## v4 重整／快取診斷

`/audio-test/cache.html` 直接使用正式站 btc-wall 音檔；`?source=controlled` 使用同位元組的同源副本，伺服器仍忽略 Range 並回 200，但加上 `Cache-Control: private, max-age=3600`。v3 原有端點仍預設 no-store。

每輪音訊要求從 10 秒播放、5 秒後跳至 20 秒、8 秒後停止。三輪依序使用新隨機網址、同網址重整、另一個新隨機網址重整。sessionStorage 保存跨重整結果，完成後複製一次。分頁轉到背景會中止該輪，以免背景計時影響比較。這是音訊本身的診斷，不含動畫或自動校正。

記錄 Resource Timing 的 responseStatus、transferSize、decodedBodySize、deliveryType，及跳轉前後 seekable／buffered。只有 transferSize=0 且 decodedBodySize>0 才標記 local-cache；跨域或未完成請求的零值標為無法判斷，不用下載時間猜快取。控制副本可以驗證瀏覽器機制，但不等同正式站完整網路路徑。

10 個診斷測試通過；部署後核對原 preview.js 及 bindings 保持一致，正式 player.js 未修改。

桌面內建瀏覽器的同源控制測試（2026-09-29）成功重現：

| 輪次 | 音檔回應狀態 | transferSize / decodedBodySize | deliveryType | 一秒後位置：要求 10 / 20 秒 | seekable |
| --- | --- | --- | --- | --- | --- |
| 首次新網址 | 200 | 812869 / 812569 | 空字串 | 0.95 / 0.95 | 0–0 |
| 同網址重整 | 206 | 0 / 812569 | cache | 10.97 / 20.94 | 0–54.8 |
| 換新網址重整 | 200 | 812869 / 812569 | 空字串 | 0.94 / 0.94 | 0–0 |

第一、二輪 audioUrl 完全一致；第三輪只更換 audio_test token。另以獨立 HTTP Range 請求驗證伺服器仍回 200 整檔、無 Accept-Ranges／Content-Range，因此第二輪的 206 是瀏覽器快取路徑產生的回應。此結果直接支持「重整後快取掩蓋原始傳輸的跳轉限制」，不表示所有瀏覽器都採用相同行為。

正式原始音檔直接載入也重現相同三輪結果：第一輪 0.94／0.94 秒，第二輪 10.94／20.94 秒，第三輪 0.94／0.94 秒；seekable 依序為 0–0、0–54.8、0–0。確認第一、二輪網址相同、第三輪網址不同。跨域 Resource Timing 大小與狀態碼皆為 0，故正式來源的快取路徑判斷來自三輪行為與同源控制實驗的交叉支持，不能將該 0 值直接當成快取命中。生產部署仍為 926928b6-cd55-42ef-bc9d-d11ddf440afc。

## 部署保護細節

使用 Cloudflare 插件讀取現役 preview Worker 的完整 preview.js 模組，再加入 worker.mjs、transform.mjs、range.mjs、files.mjs。
worker.mjs 僅接管 /audio-test/；其餘請求委派至原模組，重新匯出原 ArenaRoom。
PUT 使用 keep_assets: true 並保留現役 bindings、相容設定、observability 等；不執行 DO migration，不用主分支的 wrangler staging 設定覆蓋 preview。
每次部署必須核對預期版本、原模組內容及綁定。原 FLOW ARENA HTML 路徑 /orderflow/flow-arena.html 在本次部署前就回應 404；本輪未重新驗收多人對戰。

node experiments/audio-diagnostics/build.mjs 產生忽略的 .wrangler/audio-diagnostics/modules.json。部署時另帶現役 preview.js；不要把它換成 main 的 src/preview.ts。
node --test experiments/audio-diagnostics/*.test.mjs 驗證 A 重現自動 seek、B 不自動 seek、固定時序探針，以及 Range 回應與內容一致性。

曾有全域字串包裝錯誤處理的提案被自動審查拒絕，該提案未執行。最終使用獨立模組重組上傳，原 preview.js 保持原文。
