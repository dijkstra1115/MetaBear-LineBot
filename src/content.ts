import { bitoproQuestions } from "../public/guide-bitopro.js";
import { cardQuestions } from "../public/guide-card.js";
import type { Step, LineMessage, Action } from "./types";

export const BUSINESS = {
  exchange: "BingX",
  code: "ZD0CQ0",
  inviteUrl: "https://bingx.com/invite/ZD0CQ0",
  depositRequirement: "已入金即可，允許內部轉帳",
  supportUrl: "https://lin.ee/cbyuRJv",
  notion: "https://app.notion.com/p/26fe08720786805185bde4952de1d9d7",
  kycVideo: "https://www.youtube.com/watch?v=NIjpeGilxBE",
};
export const STEPS: Record<
  Step,
  {
    title: string;
    text: string;
    image?: string;
    images?: { src: string; caption: string }[];
    parent?: Step;
    related: Step[];
  }
> = {
  register: {
    title: "如何註冊 BingX？",
    image: "/guides/register.jpg",
    related: ["code", "kyc"],
    text: `從專屬連結開啟 BingX：\n${BUSINESS.inviteUrl}\n\n選擇 Email 或手機註冊。送出前展開「Referral Code／推薦碼」，確認是 ${BUSINESS.code}，再依畫面完成驗證。\n\n透過此邀請碼註冊並交易，MetaBear 可能獲得推薦佣金。密碼與驗證碼只輸入在交易所。`,
  },
  code: {
    title: "邀請碼填在哪裡？",
    image: "/guides/register.jpg",
    related: ["register", "kyc"],
    text: `在註冊頁找到「Referral Code (Optional)／推薦碼」，填入 ${BUSINESS.code}。中間與最後的 0 都是數字零。\n\n用邀請連結開啟後也請再確認一次。已註冊、漏填或綁定其他邀請碼的情況，請選「人工協助」確認交易所現行規則；提交 UID 不代表推薦關係已核實。`,
  },
  kyc: {
    title: "如何完成 KYC？",
    image: "/guides/kyc.jpg",
    related: ["deposit", "uid"],
    text: `在 BingX 帳戶的「身分認證」依官方畫面提交資料，並確認審核結果。實際要求與可用功能以你的帳戶頁面為準。\n\n原有 KYC 影片：${BUSINESS.kycVideo}\n\n身分證、自拍與銀行資料請只交給交易所；LINE 客服不需要這些資料。`,
  },
  deposit: {
    title: "入金多少才能入群？",
    related: ["deposit_bitopro", "deposit_card", "uid"],
    text: `MetaBear 入群條件：邀請關係符合、KYC 完成，且 BingX 已入金即可；不設最低金額，允許內部轉帳。提交 UID 後由系統查詢資格。\n\n有兩種圖文教學可選：\n① BitoPro：綁定銀行 → 台幣入金 → 買 USDT → 轉入自己的 BingX。\n② BingX 信用卡：完成 KYC → 快捷買幣 → 信用卡／簽帳金融卡 → 查看訂單與到帳。\n\n點選「BitoPro 如何入金？」或「如何用信用卡入金？」查看對應教學。費用、支援地區與可用支付方式以你帳戶當前畫面為準。`,
  },
  deposit_bitopro: {
    title: "BitoPro 如何入金？",
    parent: "deposit",
    related: ["deposit", "deposit_card", "uid"],
    text: `1. 完成 BitoPro 身分驗證並綁定自己的銀行帳戶。在「資產 → 加值 → TWD → 銀行匯款」查看你帳戶指定的收款資訊，用已綁定銀行轉入台幣。\n2. 台幣到帳後選 USDT/TWD，確認委託價格、數量、費用與預估收到的 USDT。\n3. BingX「充值／加密貨幣充值」選 USDT，選擇兩邊均支援且開放充提的同一網路，複製你自己的充值地址。\n4. 回 BitoPro「資產 → 提領 → USDT」，選完全一致的網路，貼入自己的 BingX 地址，核對地址、Memo／Tag（如有）、最低入金額及扣費後到帳數量，再決定是否送出。\n5. 查看 BitoPro 提領紀錄與 BingX 到帳紀錄；送出不等於到帳。\n\n原圖 TRC20 為操作範例，不保證目前可用；不要抄圖中的帳號、地址或金額。MetaBear 已入金即可，允許內部轉帳；提交 UID 後查詢邀請關係、KYC 與入金狀態。`,
    images: bitoproQuestions.flatMap(({ rows }) =>
      rows.flatMap((row) =>
        "src" in row && row.src ? [{ src: row.src, caption: row.title }] : [],
      ),
    ),
  },
  deposit_card: {
    title: "如何用信用卡入金？",
    parent: "deposit",
    related: ["deposit", "deposit_bitopro", "uid"],
    text: `1. 登入 BingX，先完成帳戶要求的身分驗證；到首頁「充值 → 快捷買幣」。\n2. 選擇法幣及 USDT，輸入金額，查看實際匯率、手續費及預計收到的 USDT。\n3. 選擇帳戶可用的「信用卡／簽帳金融卡」，閱讀支付條款後自行決定是否繼續。\n4. 若畫面要求，填自己的英文帳單地址與持卡人資訊，再由銀行完成驗證。卡號與 OTP 只填在官方付款／銀行頁面，不傳給 LINE。\n5. 「授權成功」只代表付款方式驗證，不等於買幣完成；回到訂單與資產頁確認購買狀態及 USDT 到帳。\n\n圖中 100 USDT、匯率與 1 TWD 驗證均為舊畫面示例，並非本次承諾；MetaBear 已入金即可，允許內部轉帳；提交 UID 後查詢資格。可用卡別、費率與付款供應商以當前帳戶為準。`,
    images: cardQuestions.flatMap(({ rows }) =>
      rows.flatMap((row) =>
        "src" in row && row.src ? [{ src: row.src, caption: row.title }] : [],
      ),
    ),
  },
  uid: {
    title: "如何查找及提交 UID？",
    related: ["deposit", "code"],
    text: "在 BingX 個人資料頁複製 UID，回覆「UID 你的數字」，例如 UID 123456789。\n\n提交後，系統會把你的 LINE 使用者識別碼與 BingX UID 配對，查詢邀請關係、KYC 與入金。三項通過後自動發送 VIP 社群連結；已入金即可，允許內部轉帳。\n\n可回覆「我的進度」查看結果，或「重新查詢」更新狀態。遇到例外由小幫手協助；不要提交密碼、驗證碼或 API 金鑰。行銷通知另由你選擇訂閱或退訂。",
  },
};
export const LESSONS: Record<string, string> = {
  合約基礎:
    "合約交易是在交易價格變動的曝險。做多與做空代表不同的損益方向，不等同持有現貨。\n\n先理解保證金、槓桿、委託方式、強制平倉與費用，再看模擬操作。你可以選下面的概念逐一了解；這裡不提供即時買賣點位。",
  開倉流程:
    "開倉畫面通常需要確認：合約種類與交易對 → 逐倉／全倉 → 槓桿 → 市價／限價 → 數量與保證金 → 委託確認。實際欄位以 BingX 當前畫面為準。\n\n送出委託不一定代表成交；限價單可能等待成交。成交後才形成倉位。平倉或減倉需核對方向與數量，避免把相反委託誤當平倉。可以先在官方模擬環境認識欄位。",
  槓桿: "槓桿讓名義倉位大於投入的保證金。名義倉位不變時，更高槓桿通常代表較少初始保證金與更小的虧損緩衝。\n\n簡化例子：名義價值 1,000 USDT 的倉位，價格變動 1% 對應約 10 USDT 損益；這還沒計算費用、資金費率等。槓桿不會提高判斷方向正確的機率。",
  逐倉與全倉:
    "逐倉為指定倉位配置保證金；全倉依平台規則共享帳戶內可用保證金。\n\n逐倉的風險通常集中在分配的保證金，但追加或自動追加保證金會改變曝險；全倉可能讓其他可用資金一起承擔虧損。實際範圍需看帳戶與產品設定。",
  市價與限價:
    "市價單以當時可成交的價格執行，成交均價可能因深度不足或行情快速變化而偏離看到的價格。\n\n限價單限制可接受價格，但不保證成交，也可能只成交部分。委託成功與交易成交是兩件事。",
  停損與強平:
    "停損是符合觸發條件後執行的委託機制；強制平倉是保證金不足時平台依規則減倉或平倉。兩者不同。\n\n一般停損可能受滑價、委託類型與市場流動性影響。強平參考的標記價格也可能與最後成交價不同，不能把停損視為必定在指定價格成交的保證。",
  資金費率:
    "永續合約的資金費率是依規則在多空持倉者間結算的費用，用來協助合約價格靠近參考價格。\n\n費率方向、結算週期和是否需要支付，要看當前合約規則與持倉時間。資金費用與開平倉手續費不同；費率也不能單獨當成漲跌訊號。",
  OI: "OI 是尚未結清合約的總量。每筆合約同時有多空雙方，所以 OI 上升不能直接解讀為看漲；需區分持倉增加與價格方向。",
  Volume:
    "成交量描述一段時間內的交易活躍程度。放量可能伴隨多種市場情況，不能單靠成交量判斷之後的方向。",
  CVD: "CVD 累積主動買入與主動賣出成交量的差值。不同交易所與資料來源的分類方式可能不同，它不涵蓋所有市場參與者的意圖。",
  "Order Book Depth":
    "委託簿深度描述各價格層級等待成交的掛單量。掛單可被撤回，畫面上的深度不保證未來成交時仍存在。",
  RSI: "RSI 是根據一段期間價格漲跌計算的動能指標。高低讀值不等於價格一定反轉，趨勢中可能維持極端值一段時間。",
};
export const command = (label: string, text = label): Action =>
  label === text
    ? { type: "message", label, text }
    : {
        type: "postback",
        label,
        data: new URLSearchParams({ text }).toString(),
        displayText: label,
      };
export const link = (label: string, uri: string): Action => ({
  type: "uri",
  label,
  uri,
});
export const reply = (text: string, actions: Action[] = []): LineMessage => ({
  type: "text",
  text: text.slice(0, 4900),
  ...(actions.length
    ? {
        quickReply: {
          items: actions
            .slice(0, 13)
            .map((action) => ({ type: "action" as const, action })),
        },
      }
    : {}),
});
export const menu = (
  welcome = "我是 MetaBear 小幫手。你可以直接說卡在哪裡，或先選一個最接近的需求。",
) =>
  reply(welcome, [
    command("開始註冊"),
    command("入金教學"),
    command("查詢進度", "我的進度"),
    command("遇到問題", "人工協助"),
    command("更多教學"),
  ]);

export const moreMenu = () =>
  reply("你想看哪一項？每個問題都能獨立查看。", [
    command("常見問題"),
    command(STEPS.code.title),
    command(STEPS.kyc.title),
    command(STEPS.deposit_bitopro.title),
    command(STEPS.deposit_card.title),
    command(STEPS.uid.title),
    command("合約基礎"),
    command("交易偏好"),
    command("通知設定"),
    command("人工協助"),
    command("選單"),
  ]);
// The website and LINE deliberately share the same ordered image/explanation rows.
export function guidePages(step: Step) {
  const questions =
    step === "deposit_bitopro"
      ? bitoproQuestions
      : step === "deposit_card"
        ? cardQuestions
        : null;
  return (
    questions?.flatMap((q) =>
      q.rows.map((row, index) => ({
        title: row.title,
        src: "src" in row ? row.src : undefined,
        text: [
          index === 0 ? q.intro : "",
          row.action,
          row.reason,
          index === q.rows.length - 1 ? q.check : "",
        ]
          .filter(Boolean)
          .join("\n\n"),
      })),
    ) ?? [
      {
        title: STEPS[step].title,
        src: STEPS[step].image,
        text: STEPS[step].text,
      },
    ]
  );
}
export function guidePage(step: Step, page: number) {
  return Math.max(
    0,
    Math.min(
      guidePages(step).length - 1,
      Number.isFinite(page) ? Math.floor(page) : 0,
    ),
  );
}
export function navigation(
  actions: Action[],
  text = "接下來想做什麼？",
): Extract<LineMessage, { type: "flex" }> {
  return {
    type: "flex",
    altText: text,
    contents: {
      type: "bubble",
      body: {
        type: "box",
        layout: "vertical",
        contents: [{ type: "text", text, wrap: true }],
      },
      footer: {
        type: "box",
        layout: "vertical",
        contents: actions.map((action, i) => ({
          type: "button",
          action,
          style: i === 0 ? "primary" : "link",
          height: "sm",
        })),
      },
    },
    quickReply: {
      items: actions.map((action) => ({ type: "action", action })),
    },
  };
}
export function guide(
  step: Step,
  baseUrl: string,
  allowLocalImages = false,
  page = 0,
): LineMessage[] {
  const item = STEPS[step];
  const pages = guidePages(step);
  page = guidePage(step, page);
  const current = pages[page];
  const canSendImages =
    /^https:\/\//.test(baseUrl) ||
    (allowLocalImages &&
      /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(baseUrl));
  const progressive = pages.length > 1;
  const actions = [
    ...(progressive && page + 1 < pages.length
      ? [command("下一張", `圖片教學 ${step} ${page + 1}`)]
      : progressive
        ? [command("提交 UID")]
        : []),
    ...(page > 0 ? [command("上一張", `圖片教學 ${step} ${page - 1}`)] : []),
    ...(progressive
      ? [command("選擇入金方式", "入金教學")]
      : item.related.map((topic) => command(STEPS[topic].title))),
    command("人工協助"),
    command("選單"),
  ];
  const card = navigation(actions);
  if (progressive) {
    const heading = `${item.title} · ${page + 1}/${pages.length}`;
    card.altText = `${heading}｜${current.title}`;
    card.contents.body.contents = [
      { type: "text", text: heading, wrap: true, size: "sm", color: "#666666" },
      {
        type: "text",
        text: current.title,
        wrap: true,
        size: "lg",
        weight: "bold",
        margin: "md",
      },
      ...(current.src && canSendImages
        ? [
            {
              type: "image" as const,
              url: baseUrl + current.src,
              size: "full" as const,
              aspectMode: "fit" as const,
              aspectRatio: "3:4",
              action: link("放大圖片", baseUrl + current.src),
              margin: "md" as const,
            },
          ]
        : []),
      {
        type: "text",
        text: current.text,
        wrap: true,
        size: "md",
        margin: "md",
      },
    ];
    return [card];
  }
  // Keep the navigation on the final message and inside the card, so later
  // messages cannot remove the only available controls.
  return [
    reply(`【${item.title}】\n\n${item.text}`, actions),
    ...(current.src && canSendImages
      ? [
          {
            type: "image" as const,
            originalContentUrl: baseUrl + current.src,
            previewImageUrl: baseUrl + current.src,
          },
        ]
      : []),
    card,
  ];
}
