// Short website explanations paired with the existing teaching screenshots.
export const bitoproQuestions = [
  {
    id: "twd",
    app: "打開 BitoPro",
    title: "台幣怎麼入金？",
    intro: "先完成 BitoPro 身分驗證，並綁定本人銀行帳戶。",
    rows: [
      {
        src: "/guides/bitopro-01a.jpg",
        title: "在資產頁點「加值」",
        action: "打開 BitoPro「資產」，選擇「加值」。",
        reason: "先把台幣轉進來，才能買 USDT。",
      },
      {
        src: "/guides/bitopro-01b.jpg",
        title: "選擇 TWD 新臺幣",
        action: "在幣種清單找到 TWD。",
        reason: "銀行轉入的是台幣，這裡先不選 USDT。",
      },
      {
        src: "/guides/bitopro-01c.jpg",
        title: "查看台幣收款資訊",
        action: "選「銀行匯款」，用已綁定的銀行轉入帳戶顯示的收款帳號。",
        reason: "請用自己帳戶的資訊，不要抄圖中帳號。",
      },
    ],
    check: "BitoPro 台幣餘額增加後，再買 USDT。",
  },
  {
    id: "buy",
    app: "打開 BitoPro",
    title: "怎麼買 USDT？",
    intro: "台幣到帳後，在 BitoPro 換成要轉出的 USDT。",
    rows: [
      {
        src: "/guides/bitopro-02.jpg",
        title: "找到 USDT／TWD",
        action: "在市場選擇 USDT／TWD。",
        reason: "這個交易對就是用台幣買 USDT。",
      },
      {
        src: "/guides/bitopro-03.jpg",
        title: "確認價格與數量",
        action: "查看買入價格、數量與費用，再決定是否下單。",
        reason: "委託送出後，仍要等成交。",
      },
    ],
    check: "查看成交紀錄與可用 USDT 餘額。",
  },
  {
    id: "address",
    app: "打開 BingX",
    title: "BingX 收款地址在哪？",
    intro: "先到 BingX 取得自己的地址，再回 BitoPro 轉出。",
    rows: [
      {
        src: "/guides/bitopro-04.jpg",
        title: "在 BingX 點「充值」",
        action: "打開 BingX「資產」，選擇「充值」。",
        reason: "從這裡取得 BingX 的收款資訊。",
      },
      {
        src: "/guides/bitopro-05.jpg",
        title: "充值幣種選 USDT",
        action: "在 BingX「充值／加密貨幣充值」選 USDT。",
        reason: "收款幣種要和準備轉出的幣一致。",
      },
      {
        src: "/guides/bitopro-06.jpg",
        title: "確認兩邊的網路一致",
        action: "選擇 BingX 與 BitoPro 都支援、且開放充提的同一網路。",
        reason: "圖中 TRC20 僅為範例，不代表目前可用。",
      },
      {
        src: "/guides/bitopro-07.jpg",
        title: "複製自己的充值地址",
        action: "複製帳戶顯示的地址；若要求 Memo／Tag，也要一併記下。",
        reason: "不要使用教學圖片裡的地址。",
      },
    ],
    check: "確認幣種、網路、地址及最低入金額。",
  },
  {
    id: "send",
    app: "回到 BitoPro",
    title: "怎麼轉到 BingX？",
    intro: "回到 BitoPro，把 USDT 轉到自己的 BingX 地址。",
    rows: [
      {
        src: "/guides/bitopro-08.jpg",
        title: "開啟提領",
        action: "在 BitoPro「資產」選擇「提領」。",
        reason: "提領是把幣轉到另一個地址。",
      },
      {
        src: "/guides/bitopro-09.jpg",
        title: "提領幣種選 USDT",
        action: "在幣種清單選 USDT。",
        reason: "要和 BingX 的充值幣種一致。",
      },
      {
        src: "/guides/bitopro-10.jpg",
        title: "確認實際到帳數量",
        action:
          "先核對相同網路、自己的地址及必要的 Memo／Tag，再檢查金額與費用。",
        reason: "扣費後須達最低入金額；圖中 15 USDT 與費用僅為舊例。",
      },
    ],
    check: "送出前再核對一次；轉出不等於已到帳。",
  },
  {
    id: "received",
    app: "查看 BitoPro 與 BingX",
    title: "怎麼確認到帳？",
    intro: "以 BingX 的到帳紀錄為準。",
    rows: [
      {
        title: "核對兩邊紀錄",
        action: "先看 BitoPro 提領狀態，再到 BingX 查看充值紀錄與 USDT 餘額。",
        reason: "BitoPro 已送出，不代表 BingX 已入帳。",
      },
      {
        title: "未到帳時先查狀態",
        action: "保留交易紀錄，向平台客服確認，不要為了重試而重複轉帳。",
        reason: "客服可依交易紀錄協助追查。",
      },
    ],
    check: "已入金即可，允許內部轉帳；提交 UID 後由系統查詢資格。",
  },
];
