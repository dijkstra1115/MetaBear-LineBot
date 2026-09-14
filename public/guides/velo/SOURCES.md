# Velo 真實市場教學圖

來源：https://velo.xyz/futures/BTC
指標定義：https://docs.velo.xyz/web-app/futures
擷取日期：2026-09-14，約 13:49–13:50 Asia/Taipei。
方式：公開頁面的 Download a picture of the chart；未登入，保留完整原圖、座標、圖例及 Velo 浮水印。

範圍選擇：1w（最近一週）。横軸刻度可見 9 月 8 日至 14 日；不另推定圖表時區。
交易所：Binance、Bybit、OKX、Deribit、Hyperliquid。教學僅指圖例所列範圍，非全市場。

- btc-oi-2026-09-14.jpg：BTC Open Interest，美元計價，堆疊面積；原檔 Velo-BTC-StackedOpenInterest-1789364987743.jpg。
- btc-cvd-2026-09-14.jpg：BTC CVD Dollars，未依 OI 標準化，各交易所獨立曲線；原檔 Velo-BTC-CVD-1789365001389.jpg。
- btc-volume-2026-09-14.jpg：BTC Volume，美元成交額，按平台期間分組，交易所堆疊柱圖；原檔 Velo-BTC-Volume-1789365008600.jpg。不將 1w 範圍誤當每根柱子的週期。
- btc-price-2026-09-14.jpg：BTC Price，同樣 1w；依官方文件為 Binance USDT perpetual 最新成交價格。原檔 Velo-BTC-PriceChart-1789365021062.jpg。

圖片為定期手動更新的歷史快照。文字不將美元 OI 變化等同合約張數變化，不將 CVD 等同資金淨流入，也不把不同平台的價量資料說成完全相同的市場範圍。

## 新增指標（2026-09-14 約 13:54 Asia/Taipei）

目前官方指標定義頁：https://docs.velo.xyz/features/reference/futures （舊 /web-app/futures 路徑已失效）。以下皆由 BTC 公開頁的圖片匯出功能取得，範圍 1w，保留原圖。

- btc-funding-2026-09-14.jpg：Funding Rate (APR)，Annual 模式；Binance、Bybit、OKX、Deribit、Hyperliquid。原檔 Velo-BTC-FundingRate-1789365288178.jpg。
- btc-liquidations-2026-09-14.jpg：美元清算量，零線上方是空單清算，下方是多單清算；圖例 Binance、Bybit、OKX、Deribit。原檔 Velo-BTC-Liquidations-1789365289375.jpg。
- btc-basis-2026-09-14.jpg：3 Month Annualized Basis，圖例 Binance、OKX、Deribit；接近三個月到期的幣本位定期期貨，非永續資金費率。原檔 Velo-BTC-Basis-1789365289787.jpg。

補充概念參考：
- https://www.bingx.com/en/support/articles/16295473912079 （正費率多方支付、負費率空方支付）
- https://www.cmegroup.com/education/courses/introduction-to-equity-index-products/what-is-equity-index-basis （期貨與現貨價差）

新課程：Funding 資金費率判讀、Liquidations 清算量、Basis 期貨基差。每篇兩個短問題；基差標為進一步了解，不提供套利或方向性交易建議。
