export const lessons = [
  {
    id: "matching",
    title: "價格是怎麼走出來的？",
    short: "撮合與價差",
    en: "THE MATCHING ENGINE",
    group: "01 · 看見市場",
    focus: 2,
    summary:
      "每一次價格跳動，背後都是一場成交。先親手吃掉賣一，看價格如何走到下一檔。",
    task: "送出一筆 6 BTC 市價買單，觀察右側 Ask 的消耗，再縮遠看這筆交易留下的足跡。",
    action: "市價買入 6 BTC",
    command: "buy",
    size: 6,
    explanation:
      "買方願意立即成交，就向最低的賣價 Ask 取走流動性。該價位耗盡後，剩餘數量才往更高的賣價撮合。Bid 是最高買價；Ask − Bid 就是 spread。",
    pitfall:
      "成交價是最後一筆成交的位置；掛單報價可以先變動，卻不一定已經成交。",
    question: "一筆市價買單，先與哪一側成交？",
    options: ["最低賣價 Ask", "最高買價 Bid", "一定在中間價成交"],
    answer: 0,
    why: "主動買方吃掉被動賣單。中間價是報價的平均，未必有人願意在那裡成交。",
  },
  {
    id: "slippage",
    title: "同樣的訂單，不同的代價。",
    short: "深度與滑價",
    en: "LIQUIDITY & SLIPPAGE",
    group: "01 · 看見市場",
    focus: 2,
    summary:
      "價格旁的數量，決定你能走多遠。這次把訂單簿變薄，觀察跨越多檔的成本。",
    task: "在薄訂單簿買入 6 BTC，比較成交均價與下單前最佳 Ask；注意未成交餘量。",
    action: "掃過薄訂單簿",
    command: "buy",
    size: 6,
    explanation:
      "成交均價 = Σ(價格 × 成交數量) ÷ 總成交量。市價單可能跨越多檔，深度愈薄，相同數量通常造成更大的價格衝擊。",
    pitfall:
      "畫面只包含有限深度。模型沒有更多對手單時，餘量停止撮合，不捏造新的成交。",
    question: "最佳 Ask 不變，但各檔數量變少，大額買單通常會？",
    options: ["成交均價可能更高", "保證仍在最佳 Ask 成交", "CVD 一定下降"],
    answer: 0,
    why: "需要吃到更高價的檔位才能取得相同數量，甚至無法全數成交。",
  },
  {
    id: "limit",
    title: "把意圖放進訂單簿。",
    short: "掛單與撤單",
    en: "PASSIVE ORDERS",
    group: "01 · 看見市場",
    focus: 2,
    summary:
      "被動等待，與主動成交，是兩件不同的事。用自己的限價單改變盤面的深度。",
    task: "掛入 8 BTC 買單，再到「我的掛單」撤銷；對照 CVD 與成交量。",
    action: "掛入 8 BTC 買單",
    command: "limit",
    size: 8,
    explanation:
      "未穿越對手最佳價的限價單會等待撮合。同價位依模型的時間優先順序排隊。穿越對手報價的限價單也可能立即成為主動成交。",
    pitfall: "掛單只是尚可撤回的意願。新增與取消掛單，都不是成交量。",
    question: "撤掉 8 BTC 未成交買單，CVD 會？",
    options: ["保持不變", "減少 8 BTC", "增加 8 BTC"],
    answer: 0,
    why: "CVD 只累計已發生的主動成交；取消委託沒有成交。",
  },
  {
    id: "cvd",
    title: "誰在主動跨過價差？",
    short: "Delta 與 CVD",
    en: "AGGRESSOR FLOW",
    group: "02 · 讀懂足跡",
    focus: 0,
    summary: "買賣雙方永遠同時存在；Delta 問的是，哪一方更急著成交。",
    task: "先主動買入 4 BTC，再用下單台賣出 2 BTC；觀察 CVD 的淨變化。",
    action: "主動買入 4 BTC",
    command: "buy",
    size: 4,
    explanation:
      "Delta = 主動買量 − 主動賣量。CVD 將每個區間的 Delta 逐步累計。這裡以 BTC 數量計算，起點是本次情境開始。",
    pitfall:
      "正 CVD 不等於資金淨流入，也不保證上漲。大量主動買單可能被被動賣方吸收。",
    question: "主動買 4 BTC、主動賣 2 BTC，CVD 淨變化是？",
    options: ["+2 BTC", "+6 BTC", "−2 BTC"],
    answer: 0,
    why: "4 − 2 = +2。每一筆成交都有買賣雙方，此處按主動方分類。",
  },
  {
    id: "iceberg",
    title: "你看見的，不是全部。",
    short: "冰山單",
    en: "HIDDEN LIQUIDITY",
    group: "02 · 讀懂足跡",
    focus: 2,
    summary:
      "賣一只有 1.5 BTC，為什麼吃掉 6 BTC 後，它還在？打開隱藏量，就能看見補量的機制。",
    task: "吃入 6 BTC，觀察同價補量次數；切換「揭露隱藏量」查看教學模型的 24 BTC 總量。",
    action: "試探冰山 · 買入 6 BTC",
    command: "buy",
    size: 6,
    explanation:
      "此情境設定賣方總量 24 BTC，每次只顯示 1.5 BTC。可見量成交後，保留量補入同一價格；模型將補量部分排至同價佇列尾端。",
    pitfall:
      "真實公開 L2 不提供隱藏委託身分。重複補量也可能來自多個交易者，只能形成假設。",
    question: "真實市場同價位反覆補量，能確定什麼？",
    options: [
      "可觀察到持續補量，不能確定是單一冰山",
      "知道交易者的總倉位",
      "保證價格不會突破",
    ],
    answer: 0,
    why: "公開深度是聚合資料，不能確認委託者、剩餘隱藏量或最終意圖。",
  },
  {
    id: "absorption",
    title: "成交很多，價格卻沒走。",
    short: "吸收與耗竭",
    en: "ABSORPTION & EXHAUSTION",
    group: "02 · 讀懂足跡",
    focus: 0,
    summary:
      "吸收是大量成交遇上持續供給；耗竭則是追價力量變弱。兩者需要不同的證據。",
    task: "連續執行買入，觀察 CVD 上升而價格停留，再縮入看賣方補量。",
    action: "再買入 5 BTC",
    command: "buy",
    size: 5,
    explanation:
      "此情境的被動賣方持續補量，主動買量增加卻沒有推高價格，是吸收的示例。耗竭則通常要觀察成交速率或主動量下降，不能只憑價格橫盤判斷。",
    pitfall: "吸收不等於反轉。被動方最終耗盡後，仍可能朝原方向突破。",
    question: "CVD 上升、價格停滯，最合理的下一步？",
    options: [
      "檢查同價成交、補量與後續突破／失敗",
      "立即認定必跌",
      "認定 CVD 算錯",
    ],
    answer: 0,
    why: "先交叉確認證據，再定義價格何時否定你的假設。",
  },
  {
    id: "footprint",
    title: "放大一段行情的內部。",
    short: "Footprint 與失衡",
    en: "BID × ASK FOOTPRINT",
    group: "02 · 讀懂足跡",
    focus: 1,
    summary:
      "K 線把細節壓縮，Footprint 把成交重新攤開。每個價格都有自己的買賣壓力。",
    task: "買入 5 BTC，查看每價主動賣量 × 主動買量；點擊一個價位，進入訂單簿。",
    action: "留下買方足跡",
    command: "buy",
    size: 5,
    explanation:
      "左欄是打到 Bid 的主動賣量，右欄是打到 Ask 的主動買量。此處依 5 USDT 價格箱聚合。對角買方失衡：本價買量 ≥ 下一低價賣量的 3 倍，且兩側皆有成交。",
    pitfall:
      "此處是本情境的累積足跡，不是每根 K 線的完整 Footprint；分箱大小與區間會改變形狀。",
    question: "Footprint 的 Ask 成交量代表？",
    options: ["主動買入的成交量", "等待中的賣單總量", "尚未成交的買單"],
    answer: 0,
    why: "Ask 是主動買方接受的價格；Footprint 計算成交，與深度掛量不同。",
  },
  {
    id: "profile",
    title: "市場曾在哪裡交換最多？",
    short: "Volume Profile",
    en: "VOLUME AT PRICE",
    group: "02 · 讀懂足跡",
    focus: 1,
    summary:
      "成交量分布將時間收起來，只留下價格。最長的那一列，就是目前區間的 POC。",
    task: "在盤面買入 8 BTC，觀察量柱與 POC 的位置如何改變。",
    action: "增加此區間成交量",
    command: "buy",
    size: 8,
    explanation:
      "Profile 依價格分箱加總買賣成交量；POC 是成交量最大的價格箱。高量節點 HVN 表示大量交換，低量節點 LVN 表示較少成交，但都不是保證有效的支撐壓力。",
    pitfall: "Profile 是已成交量；訂單簿是未成交掛量。兩者不能混稱流動性。",
    question: "POC 的定義是？",
    options: [
      "選定區間成交量最大的價格箱",
      "目前掛單最多的價格",
      "未來一定反彈的位置",
    ],
    answer: 0,
    why: "POC 隨時間區間、價格分箱與新成交改變。",
  },
  {
    id: "vwap",
    title: "讓成交量替價格加權。",
    short: "VWAP",
    en: "VOLUME-WEIGHTED PRICE",
    group: "03 · 拼回全貌",
    focus: 0,
    summary:
      "每個價格的影響力不一樣。交易越多的位置，在平均價格裡的權重就越高。",
    task: "買入 10 BTC，比較最新成交價與 VWAP；VWAP 會向大量成交的位置移動。",
    action: "觀察加權均價",
    command: "buy",
    size: 10,
    explanation:
      "VWAP = Σ(成交價 × 成交量) ÷ Σ成交量。此處從情境或連線起點累計，不是交易所完整日內 VWAP。",
    pitfall: "價格在 VWAP 上方不自動代表買入訊號；起點、波動與市場狀態都重要。",
    question: "1 BTC 在 100、3 BTC 在 104 成交，VWAP 是？",
    options: ["103", "102", "104"],
    answer: 0,
    why: "(100 × 1 + 104 × 3) ÷ 4 = 103。",
  },
  {
    id: "oi",
    title: "成交以後，合約留下了嗎？",
    short: "Open Interest",
    en: "OPEN INTEREST",
    group: "03 · 拼回全貌",
    focus: 0,
    summary: "成交量記錄發生了多少交換；OI 記錄還有多少合約沒有結束。",
    task: "用「雙方開倉」買入 3 BTC，再將下單台改成「雙方平倉」成交，對照 OI。",
    action: "雙方開倉 · 3 BTC",
    command: "open",
    size: 3,
    explanation:
      "本教學採單邊 OI：買賣雙方都開倉，OI +成交量；都平倉，OI −成交量；一開一平則不變。真實逐筆成交通常無法直接得知雙方開平意圖。",
    pitfall:
      "每份合約同時有多方與空方。OI 增加只代表未平倉量增加，不能單獨說是多頭進場。",
    question: "一方新開倉，另一方平倉，單邊 OI 如何變化？",
    options: ["不變", "增加", "一定減少"],
    answer: 0,
    why: "既有風險由另一方接手，未平倉合約數沒有增加。",
  },
  {
    id: "wall",
    title: "一面牆，也可能突然消失。",
    short: "掛單牆與撤單",
    en: "LIQUIDITY INTENT",
    group: "03 · 拼回全貌",
    focus: 2,
    summary:
      "可見深度是一張隨時改寫的地圖。試著撤掉大額賣牆，看看哪些指標會動。",
    task: "撤掉 30 BTC 的賣牆，觀察深度比例變化，以及 CVD 沒有變化。",
    action: "撤銷示範賣牆",
    command: "cancel",
    size: 30,
    explanation:
      "訂單簿失衡 = (前十檔買量 − 前十檔賣量) ÷ 兩側總量。撤單可讓失衡迅速翻轉，卻沒有真實成交。需要搭配存續時間、成交與價格反應。",
    pitfall:
      "撤單不直接證明 spoofing。公開資料通常無法確認操縱意圖；本課只觀察現象。",
    question: "大賣牆消失而沒有成交證據，能說什麼？",
    options: ["可見賣方深度減少", "大戶一定已經買入", "CVD 必定暴增"],
    answer: 0,
    why: "只有可見流動性改變是已知事實，其餘需要更多資料。",
  },
  {
    id: "funding",
    title: "持有部位，也有時間成本。",
    short: "資金費率與基差",
    en: "CARRY & BASIS",
    group: "03 · 拼回全貌",
    focus: 0,
    summary:
      "成交之外，永續合約還有持倉成本。調整費率與標記價格，分開觀察兩個概念。",
    task: "切換正負資金費率，觀察 10,000 USDT 多單的單次付款方向。",
    action: "切換資金費率方向",
    command: "funding",
    size: 0,
    explanation:
      "正費率通常由多方支付空方；負費率方向相反。單次費用示例 = 名義部位 × 費率。本頁的 mark/index 溢價 = (mark − index) ÷ index，與到期合約基差不同。",
    pitfall:
      "結算頻率依商品而異。這裡不把單次費率直接當年化收益；費率高也不保證立即反轉。",
    question: "10,000 USDT 多單，正費率 0.01%，單次示例費用？",
    options: ["支付 1 USDT", "收到 1 USDT", "支付 100 USDT"],
    answer: 0,
    why: "10,000 × 0.0001 = 1，正費率下多方支付。",
  },
  {
    id: "liquidation",
    title: "當成交不再是自願的。",
    short: "清算與連鎖反應",
    en: "FORCED FLOW",
    group: "03 · 拼回全貌",
    focus: 2,
    summary: "被迫平倉可能連續吃穿訂單簿。深度越薄，同一段強制賣壓的衝擊越大。",
    task: "執行一組模擬多單清算賣單，觀察 Bid 消耗、CVD 下跌與 OI 的條件式變化。",
    action: "模擬 9 BTC 強制賣出",
    command: "liquidation",
    size: 9,
    explanation:
      "此示例假設多方被迫賣出平倉，對手也平倉，因此 OI 減少。如果對手新開倉，OI 可不變。真實 allLiquidation 的 Buy 表示多倉遭清算，不是主動買入。",
    pitfall:
      "Bybit 清算消息中的價格為破產價格，不是逐筆成交價；清算量不能再加進 CVD，避免與成交重複計算。",
    question: "清算消息標示持倉方向 Buy，代表？",
    options: ["多倉被清算", "有人主動買入", "空倉被清算"],
    answer: 0,
    why: "清算串流的 side 是被清算部位方向，與 publicTrade 的 taker side 語義不同。",
  },
  {
    id: "heatmap",
    title: "看見流動性，如何留下與離開。",
    short: "流動性熱圖",
    en: "LIQUIDITY THROUGH TIME",
    group: "03 · 拼回全貌",
    focus: 0,
    summary:
      "把每一刻的訂單簿排在一起，掛單就成了時間裡的光帶。亮度代表可見掛量，不代表成交。",
    task: "移除示範賣牆，觀察亮帶在後續快照消失；CVD 與已成交量保持不變。",
    action: "撤掉熱圖中的賣牆",
    command: "heatmap",
    size: 0,
    explanation:
      "橫軸是依序記錄的盤面快照，縱軸是價格；青綠為買方、珊瑚紅為賣方，顏色越亮代表該時點可見掛量越大。白線疊加當時最新成交價。每張圖內以同一最大掛量正規化。",
    pitfall:
      "光帶消失可能是成交、撤單或移出記錄深度。熱圖本身無法區分原因。這裡只保存每側最近 12 檔的取樣，空白不等於完全沒有掛單。",
    question: "熱圖一條明亮的掛單帶消失，最合理的判讀是？",
    options: [
      "比對逐筆成交與深度範圍，再判斷原因",
      "一定全部成交了",
      "一定有人操縱市場",
    ],
    answer: 0,
    why: "熱圖顯示可見掛量隨時間變化；成交紀錄與取樣範圍才能補上更多脈絡。",
  },
  {
    id: "confluence",
    title: "把訊號，變成可以驗證的假設。",
    short: "綜合判讀",
    en: "FROM EVIDENCE TO DECISION",
    group: "04 · 走向實戰",
    focus: 0,
    summary:
      "價格描述結果，CVD 描述主動方，OI 描述留下的部位。把它們放在一起，再決定何時放棄假設。",
    task: "進入情境實戰：先寫下證據與失效條件，再逐步揭露後續行情。",
    action: "進入情境實戰",
    command: "practice",
    size: 0,
    explanation:
      "價格上漲＋CVD 增加＋OI 增加，可以支持新增主動買壓的假設，但仍需要觀察賣方吸收、流動性、後續延續與資料範圍。先定義失效，再觀察結果。",
    pitfall:
      "多個相關指標同時亮起，不等於多份獨立證據。單一交易所資料也不代表全市場。",
    question: "哪一項最適合用來評量實戰學習？",
    options: ["證據、失效條件與回顧是否一致", "單次是否賺錢", "使用了多少指標"],
    answer: 0,
    why: "單次盈虧含有隨機性。可重複的觀察與風控流程更能衡量學習品質。",
  },
];
// Vary the correct option position without altering the source explanations.
lessons.forEach((l, i) => {
  const shift = i % 3;
  l.options = l.options.slice(shift).concat(l.options.slice(0, shift));
  l.answer = (3 - shift) % 3;
});
export const scenarios = [
  {
    id: "absorb",
    name: "買盤湧入，價格停滯",
    tag: "吸收 · CVD 背離",
    prompt: "主動買盤不斷累積。你會追價，還是等待價格確認？",
    review:
      "前段買量被賣方冰山吸收，後段主動賣壓出現。關鍵不是 CVD 為正，而是價格是否能真正離開吸收區。這是設計情境，不能外推為固定勝率。",
  },
  {
    id: "vacuum",
    name: "穿越流動性真空",
    tag: "深度 · 滑價",
    prompt:
      "可見深度薄，少量主動買單就推動價格。進場成本與可成交量值得先檢查。",
    review:
      "薄盤讓相同主動量跨越更多價位。行情上漲仍不保證能以畫面最新價買到；紙上成交以當時對手深度計算。",
  },
  {
    id: "trap",
    name: "突破之後，誰接手？",
    tag: "突破失敗 · OI",
    prompt: "最初的主動買盤能否延續？先分開描述看見的事實與你對未來的推測。",
    review:
      "情境中的買方延續失敗，後續賣壓伴隨假設的雙方平倉。真實市場不能從單筆成交直接推知開平倉。",
  },
];
