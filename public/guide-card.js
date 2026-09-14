export const cardQuestions = [
  {
    id: "start",
    app: "打開 BingX",
    title: "信用卡買幣在哪裡？",
    intro: "先完成帳戶要求的身分驗證。",
    rows: [
      {
        src: "/guides/credit-01.jpg",
        title: "在首頁點「充值」",
        action: "打開 BingX 首頁，點選「充值」。",
        reason: "從這裡選擇買幣方式。",
      },
      {
        src: "/guides/credit-02.jpg",
        title: "選擇「快捷買幣」",
        action: "在「沒有加密貨幣」下選快捷買幣。",
        reason: "這個入口可用法幣買 USDT。",
      },
    ],
    check: "確認進入快捷買幣頁面。",
  },
  {
    id: "amount",
    app: "使用 BingX",
    title: "金額與付款方式怎麼選？",
    intro: "先看實際可收到多少 USDT。",
    rows: [
      {
        src: "/guides/credit-03.jpg",
        title: "輸入想買的金額",
        action: "選法幣與 USDT，輸入付款或預計收到的金額。",
        reason: "圖中 100 USDT 為舊例；社群不設最低入金金額。",
      },
      {
        src: "/guides/credit-04.jpg",
        title: "選擇信用卡／簽帳金融卡",
        action: "查看帳戶可用的卡片選項、匯率與支付條款。",
        reason: "實際費用與可用卡別以付款頁為準。",
      },
    ],
    check: "核對總付款金額與預計收到的 USDT。",
  },
  {
    id: "card",
    app: "使用 BingX／官方付款頁",
    title: "如何填資料與綁卡？",
    intro: "資料只填在官方付款頁，不傳給 LINE。",
    rows: [
      {
        src: "/guides/credit-05.jpg",
        title: "完成畫面要求的資料",
        action: "查看交易資格，補上尚未完成的身分或帳單資料。",
        reason: "依你的帳戶畫面完成即可。",
      },
      {
        src: "/guides/credit-06.jpg",
        title: "填自己的英文帳單地址",
        action: "填入國家、城市、地址、郵遞區號與持卡人姓名。",
        reason: "請用自己的資料，不要照抄範例。",
      },
      {
        src: "/guides/credit-07.jpg",
        title: "在付款頁輸入卡片資料",
        action: "核對付款供應商與金額，再依銀行要求完成驗證。",
        reason: "圖中 1 TWD 是舊驗證示例，不是買幣價格。",
      },
    ],
    check: "卡號與 OTP 只輸入官方付款或銀行頁面。",
  },
  {
    id: "received",
    app: "回到 BingX",
    title: "授權成功就完成了嗎？",
    intro: "還要確認購買訂單與到帳紀錄。",
    rows: [
      {
        src: "/guides/credit-09.jpg",
        title: "授權成功後，回到訂單",
        action: "查看買幣訂單狀態，再確認資產頁的 USDT 餘額。",
        reason: "授權成功只代表付款方式驗證，不等於買幣完成。",
      },
    ],
    check: "已入金即可，允許內部轉帳；提交 UID 後由系統查詢資格。",
  },
];
