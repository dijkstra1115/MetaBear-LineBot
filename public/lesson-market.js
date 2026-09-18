export const marketLessonKeys = [
  "支撐與壓力",
  "OI",
  "Volume",
  "CVD",
  "Order Book Depth",
  "RSI",
  "資金費率判讀",
  "清算量",
  "期貨基差",
];
export const marketLabels = {
  OI: "OI｜未平倉量",
  Volume: "Volume｜成交量",
  CVD: "CVD｜累積成交量差",
  "Order Book Depth": "Order Book Depth｜委託簿深度",
  RSI: "RSI｜相對強弱指標",
  資金費率判讀: "Funding｜資金費率判讀",
  清算量: "Liquidations｜清算量",
  期貨基差: "Basis｜期貨基差（進一步了解）",
};
const tv = "https://www.tradingview.com/support/solutions/";
const sources = {
  oi: tv + "43000685269-open-interest/",
  volume: tv + "43000591617-volume/",
  cvd: tv + "43000725058-cumulative-volume-delta/",
  rsi: tv + "43000502338-relative-strength-index-rsi/",
  depth:
    "https://www.coinbase.com/learn/advanced-trading/what-is-a-depth-chart",
  bingx: "https://bingxservice.zendesk.com/hc/zh-tw/articles/11263317738895",
};
const row = (file, title, action, reason, app = "MetaBear 中文示意圖") => ({
  src: "/guides/market/" + file,
  title,
  action,
  reason,
  app,
});
const q = (
  id,
  title,
  intro,
  rows,
  check,
  source,
  sourceLabel = "概念與原圖：TradingView ↗",
) => ({
  id,
  title,
  intro,
  rows,
  check,
  source,
  sourceLabel,
  app: "TradingView 官方畫面",
  note: " · 示意圖與歷史截圖僅供教學，不是即時行情。",
});
const vr = (metric, title, action, reason) => ({
  src: "/guides/velo/btc-" + metric + "-2026-09-14.jpg",
  title,
  action,
  reason,
  app: "Velo 真實市場圖表｜BTC",
});
const vq = (id, title, intro, rows, check) => ({
  ...q(
    id,
    title,
    intro,
    rows,
    check,
    "https://velo.xyz/futures/BTC",
    "查看 Velo 原始圖表 ↗",
  ),
  note: " · 範圍 1w｜2026/09/14 擷取，非即時更新。",
});
export const marketQuestions = {
  OI: [
    vq(
      "meaning",
      "OI 要看哪一條線？",
      "這張圖是 BTC 未平倉部位的美元價值，顏色代表不同交易所。",
      [
        vr(
          "oi",
          "看最上緣，再看每層厚度",
          "最上緣是圖中各交易所的合計；各色區塊的厚度，才是該交易所的 OI。",
          "這週合計大約在 200 億美元附近。美元 OI 也受幣價影響，不等於合約張數。",
        ),
      ],
      "藍色區塊上緣包含下方各層，不能直接當成 Binance 的數值。",
    ),
    vq(
      "chart",
      "OI 減少，代表大家看空嗎？",
      "先看圖中 9 月 12 日附近，合計 OI 出現下移。",
      [
        vr(
          "oi",
          "OI 下降不等於空單增加",
          "圖上只能看到未平倉部位的美元價值變少，不能直接判斷多空方向。",
          "平倉、強平與幣價變化都可能影響美元 OI；每張合約都有多方和空方。",
        ),
      ],
      "OI 看尚未平倉的部位；Volume 看某段時間已成交的量。",
    ),
  ],
  Volume: [
    vq(
      "bars",
      "成交量的柱子怎麼看？",
      "這張圖以美元顯示 BTC 各時段的成交量。",
      [
        vr(
          "volume",
          "看整根高度，顏色看交易所",
          "9 月 12 日前的高柱明顯高於附近時段，表示那段交易更活躍。",
          "各色疊加才是合計；這裡的藍、紫、綠不是漲跌顏色。",
        ),
      ],
      "右側 b 是十億美元、m 是百萬美元。最右一根可能仍未走完。",
    ),
    vq(
      "compare",
      "放量就一定會漲嗎？",
      "把同一週的成交量和價格對照，不能只看一根量柱。",
      [
        vr(
          "volume",
          "先找成交量明顯放大的時段",
          "9 月 12 日前出現高量柱，接著對照下圖的相同日期。",
          "這是每段期間的成交額，不是當下未平倉的金額。",
        ),
        vr(
          "price",
          "同一時段，價格也有急升急回",
          "這段價格短暫拉高後很快回落。放量不保證價格會一路上漲。",
          "價格圖為 Binance BTC USDT 永續合約；成交量圖則涵蓋圖例所列交易所。",
        ),
      ],
      "先對齊日期與資料範圍，再看價格和成交量的關係。",
    ),
  ],
  CVD: [
    vq(
      "meaning",
      "CVD 往下代表什麼？",
      "CVD 累加市價買入與市價賣出的成交量差；這張用美元表示。",
      [
        vr(
          "cvd",
          "先看藍色 Binance 線",
          "這一週藍線大致向下，表示從圖中起點累積，主動賣出成交額較多。",
          "負值不是交易所資金外流，也不代表後面一定會跌。",
        ),
      ],
      "向下是該段賣方差值較大；線往上但仍在零下，代表差距正在縮小。",
    ),
    vq(
      "settings",
      "為什麼各交易所的 CVD 不一樣？",
      "每條線各自計算該交易所的成交，並不是同一條全市場指標。",
      [
        vr(
          "cvd",
          "橘線回升時，其他線未必跟上",
          "圖右側 Hyperliquid 橘線回升，Binance 藍線仍接近這週低位。",
          "不同交易所的主動買賣可以不同步；看圖前先確認圖例與起算期間。",
        ),
      ],
      "這張是 Dollars 模式。切換期間或改成依 OI 標準化，讀值就不能直接比較。",
    ),
  ],
  "Order Book Depth": [
    q(
      "depth",
      "深度圖的紅綠兩邊是什麼？",
      "深度圖把還沒成交的限價掛單，依價格累加畫出來。",
      [
        row(
          "depth-example.svg",
          "橫軸看價格，縱軸看累積數量",
          "左邊綠色是買單，右邊紅色是賣單；階梯越陡，該價位掛單越集中。",
          "掛單可以取消。看到大買牆，不代表價格一定會受到支撐。",
        ),
      ],
      "深度是「等待成交」，Volume 是「已經成交」，兩者不同。",
      sources.depth,
      "概念參考：Coinbase ↗",
    ),
    q(
      "book",
      "在 BingX 的委託簿怎麼看？",
      "同樣的掛單資訊，也可以用價格與數量列表查看。",
      [
        {
          src: "/guides/futures/web-8.jpg",
          title: "看右側「委託訂單」",
          action: "上方紅色是賣單，下方綠色是買單；每一列都有價格與數量。",
          reason: "「最新成交」是已成交紀錄，與還在排隊的委託訂單不同。",
          app: "BingX 官方畫面",
        },
      ],
      "買賣牆隨時可能移動或撤單，不是保證能成交的價格。",
      sources.bingx,
      "圖片來源：BingX ↗",
    ),
  ],
  RSI: [
    q(
      "read",
      "RSI 的 30、70 怎麼看？",
      "RSI 在 0～100 之間，反映一段時間的漲跌動能。",
      [
        row(
          "rsi-1.png",
          "先找紫色線和 30、70 虛線",
          "高於 70 常稱超買，低於 30 常稱超賣；描述的是近期動能狀態。",
          "不是漲到 70 元或跌到 30 元，也不是到線就要買賣。",
          "TradingView 官方圖例",
        ),
      ],
      "RSI 常用 14 根 K 線計算；切換圖表週期，代表的時間長度也會變。",
      sources.rsi,
    ),
    q(
      "signal",
      "超買就該賣、超賣就該買嗎？",
      "不能直接這樣判斷，強勢或弱勢行情可能維持很久。",
      [
        row(
          "rsi-1.png",
          "看 A → B → C → D 的變化",
          "A 在 70 上方；B 回落後，C 反彈沒超過 A，D 再跌破 B 的低點。",
          "這是動能轉弱的圖例，不保證價格會反轉。先看懂變化，不必急著記型態名稱。",
          "TradingView 官方圖例",
        ),
      ],
      "搭配價格趨勢與支撐壓力觀察，不把單一讀值當作進出場指令。",
      sources.rsi,
    ),
  ],
};

// Velo chart lessons are shared with LINE as static captioned images.
marketQuestions["資金費率判讀"] = [
  vq(
    "sign",
    "資金費率正負，代表誰付錢？",
    "資金費率是永續合約多空雙方定期交換的費用。",
    [
      vr(
        "funding",
        "先找 0% 水平線",
        "通常正費率由多方付給空方，負費率則相反；顏色代表交易所。",
        "圖中橘線數次穿越零線，代表同一家交易所的付款方向也會改變。",
      ),
    ],
    "是否付費、何時結算，仍以持倉所在交易所的規則為準。",
  ),
  vq(
    "apr",
    "圖上 10% 是每次收 10% 嗎？",
    "不是。標題 APR 表示把費率換成年化尺度，方便比較。",
    [
      vr(
        "funding",
        "先看單位，再比較高低",
        "圖中約 10% 的年化讀值，不等於下一次結算收 10%，也不是保證年收益。",
        "費率會變動；判讀擁擠程度時，還要搭配 OI、價格與各平台規則。",
      ),
    ],
    "高正費率不等於立刻要跌；負費率也不等於必定反彈。",
  ),
];
marketQuestions["清算量"] = [
  vq(
    "read",
    "清算圖向上、向下各代表什麼？",
    "清算量顯示已發生的強制平倉，不是未來爆倉價位預測。",
    [
      vr(
        "liquidations",
        "Velo 上方是空單，下方是多單",
        "零線上方表示空單被強平；下方表示多單被強平。各色代表不同交易所。",
        "下方負號只是區分方向，不是負的交易金額。柱子離零線越遠，清算額越大。",
      ),
    ],
    "這張圖的上下方向是 Velo 的顯示方式，換平台時先看圖例。",
  ),
  vq(
    "spike",
    "大量爆倉後，就會反轉嗎？",
    "不一定。清算圖能幫你回看哪一段行情出現大量被動平倉。",
    [
      vr(
        "liquidations",
        "看 9 月 12 日前的雙向大柱",
        "那段同時有明顯的空單與多單清算。單一時段的柱圖，無法看出兩者發生的先後。",
        "搭配同時段價格看波動，不把清算高峰當成已經跌完或漲完。",
      ),
    ],
    "這是圖例所列平台的已回報資料，不代表全市場清算總額。",
  ),
];
marketQuestions["期貨基差"] = [
  vq(
    "meaning",
    "期貨為什麼比現貨貴？",
    "基差用來觀察期貨與現貨的價差。這篇可在 OI、資金費率之後再看。",
    [
      vr(
        "basis",
        "這張是約三個月到期的年化基差",
        "正值表示期貨相對現貨溢價；負值則是折價。Velo 用接近三個月到期的定期期貨計算。",
        "圖中三條線都在零以上，代表所列交易所的期貨當時處於溢價。",
      ),
    ],
    "這是有到期日的期貨基差，與永續合約的資金費率不同。",
  ),
  vq(
    "annual",
    "基差 5%，代表能穩賺 5% 嗎？",
    "不能。年化基差是價差換算後的讀值，不是可直接領取的利息。",
    [
      vr(
        "basis",
        "圖上接近 5%，是年化數字",
        "實際剩餘期限的價差不能直接當成 5%；不同到期日也要先換成相同尺度比較。",
        "交易費、資金成本、保證金與執行風險，都會影響實際結果。",
      ),
    ],
    "先用它比較溢價變化，不把基差當成保證收益或單獨的進場訊號。",
  ),
];
