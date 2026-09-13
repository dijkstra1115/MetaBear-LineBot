import { BUSINESS, LESSONS, command, guide, menu, reply } from "./content";
import { ensureCustomer, now } from "./db";
import { isStep, routeQuestion, type TeachingContext } from "./assistant";
import type { Account, LineMessage } from "./types";

async function handoff(db: D1Database, userId: string): Promise<LineMessage[]> {
  await db
    .prepare(
      "UPDATE customers SET support_requested=1, updated_at=? WHERE line_user_id=?",
    )
    .bind(now(), userId)
    .run();
  return [
    reply(
      "已在後台標記需要小幫手協助。請在這裡描述卡住的畫面，客服會在 LINE 官方帳號對話中處理。\n\n漏填邀請碼、舊帳號推薦歸屬或身分轉移，需先確認交易所當前規則。你也可以繼續問我註冊與合約基礎。",
      [command("選單")],
    ),
  ];
}

export async function respond(
  db: D1Database,
  userId: string,
  input: string,
  env: Env,
  eventId: string,
): Promise<LineMessage[]> {
  const customer = await ensureCustomer(db, userId);
  const text = input.trim();
  const base = env.PUBLIC_BASE_URL.replace(/\/$/, "");
  if (/^(選單|menu|開始|你好)$/i.test(text)) {
    await db
      .prepare("DELETE FROM teaching_context WHERE line_user_id=?")
      .bind(userId)
      .run();
    return [menu()];
  }
  if (/^(停止通知|退訂|取消訂閱|訂閱通知)$/.test(text)) {
    const consent = text === "訂閱通知" ? 1 : 0;
    await db.batch([
      db
        .prepare(
          "UPDATE customers SET marketing_consent=?, consent_at=?, updated_at=? WHERE line_user_id=?",
        )
        .bind(consent, now(), now(), userId),
      db
        .prepare(
          "INSERT INTO audit_log(line_user_id, action, detail) VALUES (?, ?, ?)",
        )
        .bind(
          userId,
          "consent",
          JSON.stringify({ consent, eventId, version: "2026-09-14" }),
        ),
    ]);
    return [
      reply(
        consent
          ? "已訂閱 MetaBear 教學與活動通知。我們會依你提供的交易偏好與交易量篩選通知；隨時回覆「退訂」即可停止。"
          : "已停止行銷通知。註冊教學與人工客服仍可使用。",
        [command("選單")],
      ),
    ];
  }
  if (text === "通知設定")
    return [
      reply(
        "你可以選擇接收 MetaBear 教學、社群與交易所活動通知。我們會依你提供的偏好與交易量篩選通知。\n\n訂閱是自願的，不影響客服；隨時回覆「退訂」停止。",
        [command("訂閱通知"), command("停止通知"), command("選單")],
      ),
    ];
  if (
    /人工|客服|漏填|填錯|其他.*邀請碼|別人.*邀請碼|身份轉移|身分轉移|舊帳號/.test(
      text,
    )
  ) {
    return handoff(db, userId);
  }
  if (text === "交易偏好")
    return [
      reply(
        "你比較想收到哪一類內容？這個選擇會記錄在客服資料中。",
        ["現貨", "合約", "兩者都有", "先學基礎"].map((x) =>
          command(x, `偏好 ${x}`),
        ),
      ),
    ];
  const preferences: Record<string, string> = {
    現貨: "spot",
    合約: "futures",
    兩者都有: "both",
    先學基礎: "learning",
  };
  if (text.startsWith("偏好 ") && preferences[text.slice(3)]) {
    await db
      .prepare(
        "UPDATE customers SET preference=?, updated_at=? WHERE line_user_id=?",
      )
      .bind(preferences[text.slice(3)], now(), userId)
      .run();
    return [
      reply("已更新你的交易偏好。", [command("通知設定"), command("選單")]),
    ];
  }
  if (/^UID(?:\s*[:：]|\s+\d|\s*$)/i.test(text)) {
    const uid = text.replace(/^UID\s*[:：]?\s*/i, "");
    if (!/^\d{4,30}$/.test(uid))
      return [
        reply(
          "UID 請保留原始數字，不要加空格。格式：UID 123456789。請勿填寫 LINE ID 或信箱。",
        ),
      ];
    const existing = await db
      .prepare(
        "SELECT * FROM exchange_accounts WHERE line_user_id=? AND exchange=?",
      )
      .bind(userId, "bingx")
      .first<Account>();
    if (existing && existing.uid !== uid) {
      await db
        .prepare(
          "UPDATE customers SET support_requested=1 WHERE line_user_id=?",
        )
        .bind(userId)
        .run();
      return [
        reply(
          "你已登記其他 UID。為避免覆蓋已核實的資料，已標記由小幫手協助更正。",
        ),
      ];
    }
    const collision = await db
      .prepare(
        "SELECT line_user_id FROM exchange_accounts WHERE exchange=? AND uid=?",
      )
      .bind("bingx", uid)
      .first<{ line_user_id: string }>();
    if (collision && collision.line_user_id !== userId)
      return [
        reply("這個 UID 暫時無法登記，請選「人工協助」核對。", [
          command("人工協助"),
        ]),
      ];
    try {
      await db.batch([
        db
          .prepare(
            "INSERT INTO teaching_context(line_user_id,topic,format,updated_at) VALUES (?,'uid','text',?) ON CONFLICT(line_user_id) DO UPDATE SET topic='uid', updated_at=excluded.updated_at",
          )
          .bind(userId, now()),
        db
          .prepare(
            "INSERT INTO exchange_accounts(line_user_id, exchange, uid) VALUES (?, 'bingx', ?) ON CONFLICT(line_user_id, exchange) DO NOTHING",
          )
          .bind(userId, uid),
        db
          .prepare(
            "UPDATE customers SET stage=CASE WHEN stage='joined' THEN stage ELSE 'review' END, guide_step='uid', updated_at=? WHERE line_user_id=?",
          )
          .bind(now(), userId),
      ]);
    } catch (error) {
      if (String(error).includes("UNIQUE constraint"))
        return [
          reply("這個 UID 暫時無法登記，請由小幫手協助核對。", [
            command("人工協助"),
          ]),
        ];
      throw error;
    }
    return [
      reply(
        `已登記 BingX UID：${uid}\n狀態：${existing?.referral_status === "verified" ? "推薦關係已核實" : "待人工核實推薦關係"}。\n\n入金至少 ${BUSINESS.depositUsdt} USDT 的證明也需另外核實，完成後由小幫手安排入群。`,
        [command("我的進度"), command("通知設定"), command("人工協助")],
      ),
    ];
  }
  if (text === "我的進度") {
    const a = await db
      .prepare("SELECT * FROM exchange_accounts WHERE line_user_id=?")
      .bind(userId)
      .first<Account>();
    const labels: Record<string, string> = {
      pending: "待核實",
      verified: "已核實",
      rejected: "需補正",
    };
    return [
      reply(
        `BingX UID：${a?.uid ?? "尚未提交"}\n推薦關係：${labels[a?.referral_status ?? ""] ?? "尚未提交"}\n入金門檻：${labels[a?.deposit_status ?? ""] ?? "尚未提交"}\n入群：${customer.stage === "joined" ? "已完成" : "待小幫手安排"}\n\n瀏覽教學不代表已通過驗證。`,
        [
          command("繼續教學", `文字教學 ${customer.guide_step}`),
          command("人工協助"),
          command("選單"),
        ],
      ),
    ];
  }
  const context = await db
    .prepare(
      "SELECT topic, format, image_page FROM teaching_context WHERE line_user_id=?",
    )
    .bind(userId)
    .first<TeachingContext>();
  const nextImage =
    /^(?:看?(?:下一張|下張|下一組|下一組圖)|繼續看圖)[！!。?？]*$/.test(text) &&
    context &&
    isStep(context.topic);
  const route = nextImage
    ? { topic: context.topic, format: "image" as const }
    : await routeQuestion(text, context, env);
  const explicitPage = text.match(/^圖片教學 \w+ (\d+)$/);
  const imagePage = nextImage
    ? (context.image_page ?? 0) + 1
    : explicitPage
      ? Number(explicitPage[1])
      : 0;
  if (route.topic === "support") return handoff(db, userId);
  if (route.topic === "clarify") {
    return [
      reply(
        context
          ? "你想了解剛才哪個部分？可以直接說「邀請碼填在哪裡」「看圖片」，或告訴我你目前卡住的畫面。"
          : "你想了解註冊帳號、填邀請碼，還是合約基礎？直接告訴我就可以，例如「我該如何註冊」，我會一步步帶你操作。",
        [
          command("開始註冊"),
          command("邀請碼教學"),
          command("合約基礎"),
          command("人工協助"),
        ],
      ),
    ];
  }
  await db
    .prepare(
      "INSERT INTO teaching_context(line_user_id,topic,format,image_page,updated_at) VALUES (?,?,?,?,?) ON CONFLICT(line_user_id) DO UPDATE SET topic=excluded.topic,format=excluded.format,image_page=excluded.image_page,updated_at=excluded.updated_at",
    )
    .bind(userId, route.topic, route.format, Math.min(imagePage, 100), now())
    .run();
  if (isStep(route.topic)) {
    const stageMap = {
      register: "registering",
      code: "registering",
      kyc: "kyc",
      deposit: "deposit",
      deposit_bitopro: "deposit",
      deposit_card: "deposit",
      uid: "deposit",
    };
    await db
      .prepare(
        "UPDATE customers SET guide_step=?, stage=CASE WHEN stage IN ('review','joined') THEN stage ELSE ? END, updated_at=? WHERE line_user_id=?",
      )
      .bind(route.topic, stageMap[route.topic], now(), userId)
      .run();
    return guide(
      route.topic,
      base,
      route.format === "image",
      env.ENVIRONMENT === "development" &&
        env.LINE_DELIVERY_MODE === "disabled",
      imagePage,
    );
  }
  return [
    reply(
      "【" +
        route.topic +
        "】\n\n" +
        LESSONS[route.topic] +
        (route.format === "image"
          ? "\n\n這個主題目前有文字教材，還沒有對應的教學圖片。"
          : ""),
      [
        "開倉流程",
        "槓桿",
        "逐倉與全倉",
        "市價與限價",
        "停損與強平",
        "資金費率",
        "選單",
      ].map((x) => command(x)),
    ),
  ];
}
