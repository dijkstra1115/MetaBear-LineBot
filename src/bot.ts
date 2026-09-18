import {
  LESSONS,
  STEPS,
  command,
  guide,
  guidePage,
  isLesson,
  lessonGuide,
  lessonPage,
  navigation,
  menu,
  moreMenu,
  futuresMenu,
  marketMenu,
  reply,
} from "./content";
import { ensureCustomer, now } from "./db";
import {
  directRoute,
  fallbackRoute,
  finalizeRoute,
  isAdvanceCommand,
  isMenuCommand,
  isNextPageCommand,
  isPagedTopic,
  isPreviousPageCommand,
  isProgressCommand,
  isReplayCommand,
  isStep,
  isSupportCommand,
  routeQuestion,
  teachingContextIsCurrent,
  type RoutedTeachingContext,
  type TeachingContext,
} from "./assistant";
import type { Account, LineMessage } from "./types";
import { enqueueSync, customerAutomation } from "./automation";
import { getTeam, personalize } from "./team";
import { knowledgeCandidates } from "./knowledge";
import { recentConversation } from "./conversations";
import { activeSupportCase, requestSupport, resumeBot } from "./support";
import { isGreeting } from "./greetings";
import { faqMenu, knowledgeActions } from "./faq";
import { setSignalSubscription, userSignalSubs } from "./signals";

async function handoff(
  env: Env,
  userId: string,
  eventId: string,
): Promise<LineMessage[]> {
  const { support, created } = await requestSupport(env, userId, eventId);
  const claimed = support.status === "claimed";
  return [
    reply(
      created
        ? "已通知客服有新的協助需求。請直接在這裡描述卡住的畫面或步驟；客服認領後，Bot 會暫停自動回答。請勿提供密碼或登入驗證碼。"
        : claimed
          ? `客服${support.owner_name ? `「${support.owner_name}」` : ""}已接手。你可以繼續留言；若想先使用自動教學，請點「繼續使用小幫手」。`
          : "你的人工協助需求仍在等待認領，不必重複申請。可以繼續描述卡住的地方。",
      [...(claimed ? [command("繼續使用小幫手")] : []), command("選單")],
    ),
  ];
}

function contextTitle(context: TeachingContext): string {
  if (isStep(context.topic)) return STEPS[context.topic].title;
  if (Object.hasOwn(LESSONS, context.topic)) return context.topic;
  if (context.topic.startsWith("kb:")) return "剛才的常見問題";
  return context.topic;
}

function noContextClarify(): LineMessage[] {
  return [
    reply("你想了解哪個問題？可以直接點選。", [
      command("開始註冊"),
      command("入金教學"),
      command("我的進度"),
      command("常見問題"),
      command("人工協助"),
    ]),
  ];
}

function teachingClarify(context: TeachingContext): LineMessage[] {
  const title = contextTitle(context);
  const page = isStep(context.topic)
    ? `第 ${(context.image_page ?? 0) + 1} 步`
    : isLesson(context.topic)
      ? `第 ${(context.image_page ?? 0) + 1} 頁`
      : "";
  return [
    reply(
      page
        ? `目前是「${title}」${page}。要再看一次、看下一張，或找人工協助嗎？`
        : `目前是「${title}」。要再看一次，或找人工協助嗎？`,
      [
        command("再看一次"),
        command("下一張"),
        command("人工協助"),
        command("選單"),
      ],
    ),
  ];
}

async function saveContext(
  db: D1Database,
  userId: string,
  topic: string,
  format: "text" | "image",
  imagePage: number,
  clarifyStreak: number,
) {
  await db
    .prepare(
      "INSERT INTO teaching_context(line_user_id,topic,format,image_page,clarify_streak,updated_at) VALUES (?,?,?,?,?,?) ON CONFLICT(line_user_id) DO UPDATE SET topic=excluded.topic,format=excluded.format,image_page=excluded.image_page,clarify_streak=excluded.clarify_streak,updated_at=excluded.updated_at",
    )
    .bind(userId, topic, format, Math.min(imagePage, 100), clarifyStreak, now())
    .run();
}

export async function respondToInboundMedia(
  db: D1Database,
  userId: string,
  env: Env,
  eventId: string,
  messageType: string,
): Promise<LineMessage[]> {
  if (["image", "video"].includes(messageType)) {
    const stored = await db
      .prepare(
        "SELECT topic, format, image_page, updated_at, clarify_streak FROM teaching_context WHERE line_user_id=?",
      )
      .bind(userId)
      .first<TeachingContext>();
    const context = teachingContextIsCurrent(stored) ? stored : null;
    if (
      context &&
      (context.topic === "kyc" || context.topic.startsWith("deposit"))
    ) {
      const title = contextTitle(context);
      return [
        reply(
          `已收到圖片／影片。我不會辨識截圖內容。若你卡在「${title}」，可以再看此步，或改找人工協助。`,
          [command("再看此步"), command("轉人工"), command("選單")],
        ),
      ];
    }
    const support = await requestSupport(env, userId, eventId);
    return [
      reply(
        support.created
          ? "已收到圖片／影片並通知客服查看。附件不會由 Bot 自動核實，也不會因此自動通過入群。"
          : "已收到圖片／影片，現有人工協助案件仍保留。附件不會由 Bot 自動核實，也不會因此自動通過入群。",
        [command("人工協助"), command("選單")],
      ),
    ];
  }
  return [
    reply(
      "目前請用文字或下方按鈕描述你卡住的步驟。貼圖、語音、位置或檔案不會用來判斷教學進度。",
      [command("選單"), command("人工協助")],
    ),
  ];
}

export async function respond(
  db: D1Database,
  userId: string,
  input: string,
  env: Env,
  eventId: string,
  eventTimestamp = Date.now(),
): Promise<LineMessage[]> {
  return personalize(
    await respondBase(db, userId, input, env, eventId, eventTimestamp),
    await getTeam(db),
  );
}
async function respondBase(
  db: D1Database,
  userId: string,
  input: string,
  env: Env,
  eventId: string,
  eventTimestamp: number,
): Promise<LineMessage[]> {
  const customer = await ensureCustomer(db, userId);
  const text = input.trim();
  const base = env.PUBLIC_BASE_URL.replace(/\/$/, "");
  if (isMenuCommand(text)) {
    await db
      .prepare("DELETE FROM teaching_context WHERE line_user_id=?")
      .bind(userId)
      .run();
    return [menu()];
  }
  if (text === "更多教學") return [moreMenu()];
  if (text === "合約教學") return [futuresMenu()];
  if (text === "看盤教學") return [marketMenu()];
  if (text === "後台")
    return [reply(`管理員後台（需登入）：\n${base}/admin`, [command("選單")])];
  if (text === "繼續使用小幫手") {
    await resumeBot(db, userId);
    return [
      reply("已恢復自動教學；人工協助案件仍會保留。", [
        command("更多教學"),
        command("選單"),
      ]),
    ];
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
        "教學與活動通知、分析師報單是兩套設定，可分開選擇。\n\n行銷通知：回覆「訂閱通知」或「退訂」。\n報單：回覆「報單通知」，自選 BTC、ETH 等品項。已入群且未封鎖才會收到報單。退訂行銷不會取消報單。",
        [
          command("訂閱通知"),
          command("停止通知"),
          command("報單通知"),
          command("選單"),
        ],
      ),
    ];
  if (text === "報單通知" || text === "報單訂閱") {
    const categories = await userSignalSubs(db, userId);
    const lines = categories.map(
      (c) => `${c.label}：${c.subscribed ? "已訂閱" : "未訂閱"}`,
    );
    return [
      reply(
        `選擇要接收的分析師報單品項。預設全關，與行銷通知分開。只有已入群且未封鎖才會收到。\n\n${lines.join("\n")}\n\n內容為分析師觀點，非投資建議。`,
        [
          ...categories.map((c) =>
            command(
              c.subscribed ? `退訂 ${c.label}` : `訂閱 ${c.label}`,
              `${c.subscribed ? "退訂報單" : "訂閱報單"} ${c.id}`,
            ),
          ),
          command("選單"),
        ],
      ),
    ];
  }
  const signalSub = /^(訂閱|退訂)報單\s+([A-Z0-9]+)$/.exec(text);
  if (signalSub) {
    const label = await setSignalSubscription(
      db,
      userId,
      signalSub[2],
      signalSub[1] === "訂閱",
    );
    if (!label)
      return [
        reply("找不到這個報單品項。請回覆「報單通知」查看可選項目。", [
          command("報單通知"),
          command("選單"),
        ]),
      ];
    return [
      reply(
        signalSub[1] === "訂閱"
          ? `已訂閱 ${label} 報單。已入群後就會收到這個品項的通知；隨時可再退訂。`
          : `已退訂 ${label} 報單。其他品項與教學通知不受影響。`,
        [command("報單通知"), command("選單")],
      ),
    ];
  }
  if (isSupportCommand(text)) {
    return handoff(env, userId, eventId);
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
  if (/^\d{4,30}$/.test(text)) {
    return [
      reply(`要將 BingX UID ${text} 登記到這個 LINE 帳號嗎？確認後才會寫入。`, [
        command("是，登記此 UID", `UID ${text}`),
        command("不是這題"),
        command("選單"),
      ]),
    ];
  }
  if (
    /^UID(?:\s*[:：]|\s+\d|\s*$)/i.test(text) ||
    /(?:我的|BingX).*UID\s*[:：]?\s*\d{4,30}\s*$/i.test(text)
  ) {
    const uid = text.replace(
      /^(?:我的\s*|BingX\s*)?UID\s*(?:是|[:：])?\s*/i,
      "",
    );
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
          [command("人工協助"), command("我的進度"), command("選單")],
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
            "INSERT INTO teaching_context(line_user_id,topic,format,updated_at) VALUES (?,'uid','text',?) ON CONFLICT(line_user_id) DO UPDATE SET topic='uid', updated_at=excluded.updated_at, clarify_streak=0",
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
    const automated = (await getTeam(db)).automation_enabled;
    if (automated) await enqueueSync(env, userId, "full");
    return [
      reply(
        `已登記 BingX UID：${uid}\n\n${automated ? "正在查詢邀請關係、KYC 與入金狀態。通過後會自動傳送 VIP 社群連結。" : "推薦關係、KYC 與入金待小幫手核實。"}\n入金不設最低金額，允許內部轉帳。可回覆「我的進度」查看結果。`,
        [command("我的進度"), command("通知設定"), command("人工協助")],
      ),
    ];
  }
  if (isProgressCommand(text)) {
    const account = await db
      .prepare(
        "SELECT uid FROM exchange_accounts WHERE line_user_id=? AND exchange='bingx'",
      )
      .bind(userId)
      .first<{ uid: string }>();
    if (!account)
      return [
        reply(
          "你還沒有提交 BingX UID。請先在個人資料頁複製 UID，再回覆「UID 你的數字」，即可查詢資格。",
          [
            command("提交 UID"),
            command("入金教學"),
            command("人工協助"),
            command("選單"),
          ],
        ),
      ];
    if ((await getTeam(db)).automation_enabled) {
      if (text !== "我的進度") await enqueueSync(env, userId);
      const info = await customerAutomation(env, userId);
      const snapshot = info.snapshot;
      const vip = info.deliveries[0];
      const pending = info.jobs.some((job) =>
        ["pending", "running"].includes(String(job.status)),
      );
      const syncFailed = info.jobs.some(
        (job) =>
          job.error &&
          ["pending", "running", "failed"].includes(String(job.status)),
      );
      const detail = !snapshot
        ? syncFailed
          ? "交易所查詢暫時失敗，系統會重試；你的 UID 已保留，無須重複登記。"
          : "等待交易所查詢"
        : snapshot.stale
          ? "資料更新中，暫待確認"
          : snapshot.qualification === "eligible"
            ? "邀請關係、KYC 與入金已通過"
            : snapshot.reasons.join("；");
      return [
        reply(
          `${detail}${pending ? "\n已排入查詢，稍後可再查看。" : ""}\nVIP 邀請：${vip?.status === "accepted" ? "LINE 已接受發送（不代表已入群）" : customer.stage === "joined" ? "已確認入群" : "通過後自動安排"}\n\n已入金即可，允許內部轉帳。`,
          [command("重新查詢"), command("人工協助"), command("選單")],
        ),
      ];
    }
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
          command(STEPS[customer.guide_step].title),
          command("人工協助"),
          command("選單"),
        ],
      ),
    ];
  }
  const claimedSupport = await activeSupportCase(db, userId);
  if (claimedSupport?.status === "claimed" && claimedSupport.bot_paused)
    return [
      reply(
        `客服${claimedSupport.owner_name ? `「${claimedSupport.owner_name}」` : ""}已接手，目前已暫停 Bot 自動回答。你可以繼續留言給客服，或選擇恢復自動教學。`,
        [command("繼續使用小幫手"), command("選單")],
      ),
    ];
  if (text === "不是這題") {
    await db
      .prepare("DELETE FROM teaching_context WHERE line_user_id=?")
      .bind(userId)
      .run();
    return noContextClarify();
  }
  if (isGreeting(text))
    return [
      menu(
        "哈囉！我是 MetaBear 小幫手 👋 今天有什麼想了解的？可以直接問我，或點下面的選項。",
      ),
    ];
  const faq = await faqMenu(db, text);
  if (faq) return faq;
  const stored = await db
    .prepare(
      "SELECT topic, format, image_page, updated_at, clarify_streak FROM teaching_context WHERE line_user_id=?",
    )
    .bind(userId)
    .first<TeachingContext>();
  const context = teachingContextIsCurrent(stored) ? stored : null;
  const previousImage =
    isPreviousPageCommand(text) &&
    context &&
    (isStep(context.topic) || isLesson(context.topic));
  const progressive = isPagedTopic(context?.topic);
  const nextImage =
    (isNextPageCommand(text) || (progressive && isAdvanceCommand(text))) &&
    context &&
    (isStep(context.topic) || isLesson(context.topic));
  const replay =
    isReplayCommand(text) &&
    context &&
    context.topic !== "clarify" &&
    (isStep(context.topic) ||
      Object.hasOwn(LESSONS, context.topic) ||
      context.topic.startsWith("kb:"));
  const routedAt = Date.now();
  let articles: Awaited<ReturnType<typeof knowledgeCandidates>> = [];
  let route: RoutedTeachingContext;
  if ((previousImage || nextImage) && context) {
    route = finalizeRoute(context.topic, "direct", 0);
  } else if (replay && context) {
    route = finalizeRoute(context.topic, "direct", 0);
  } else if (
    isAdvanceCommand(text) ||
    isPreviousPageCommand(text) ||
    isNextPageCommand(text) ||
    isReplayCommand(text)
  ) {
    const fallback = fallbackRoute(text, context);
    route = finalizeRoute(
      fallback.topic,
      fallback.topic === "clarify" ? "clarify" : "context",
      0,
    );
  } else if (directRoute(text)) {
    route = await routeQuestion(text, context, env, [], []);
  } else {
    let history: { role: string; text: string }[] = [];
    [articles, history] = await Promise.all([
      knowledgeCandidates(db, text, context?.topic, 5),
      recentConversation(db, userId, eventId),
    ]);
    route = await routeQuestion(text, context, env, articles, history);
  }
  await db
    .prepare(
      "INSERT OR IGNORE INTO route_events(event_id,method,topic,candidate_count,latency_ms,queue_delay_ms,created_at) VALUES (?,?,?,?,?,?,?)",
    )
    .bind(
      eventId,
      route.method,
      route.topic,
      route.candidateCount,
      Date.now() - routedAt,
      Math.max(0, routedAt - eventTimestamp),
      Date.now(),
    )
    .run();
  if (route.topic.startsWith("kb:")) {
    let article = articles.find((a) => "kb:" + a.id === route.topic);
    if (!article) {
      const id = route.topic.slice(3);
      article =
        (await db
          .prepare(
            "SELECT * FROM knowledge_articles WHERE id=? AND status='published'",
          )
          .bind(id)
          .first<(typeof articles)[number]>()) ?? undefined;
    }
    if (article) {
      let marked = false;
      if (article.requires_support) {
        const support = await requestSupport(env, userId, eventId);
        marked = support.created;
      }
      await saveContext(db, userId, route.topic, "text", 0, 0);
      await db
        .prepare(
          "INSERT INTO audit_log(line_user_id,action,detail) VALUES (?,'knowledge.answer',?)",
        )
        .bind(
          userId,
          JSON.stringify({
            eventId,
            articleId: article.id,
            revision: article.revision,
          }),
        )
        .run();
      return [
        reply(
          article.answer +
            (marked
              ? "\n\n這項問題需要人工核實，已通知客服並加入需協助名單。"
              : ""),
          knowledgeActions(article),
        ),
        navigation(knowledgeActions(article)),
      ];
    }
    return noContextClarify();
  }
  const explicitPage = text.match(/^圖片教學 (.+) (\d+)$/);
  const requestedPage = previousImage
    ? (context?.image_page ?? 0) - 1
    : nextImage
      ? (context?.image_page ?? 0) + 1
      : replay
        ? (context?.image_page ?? 0)
        : explicitPage
          ? Number(explicitPage[2])
          : 0;
  const imagePage = isStep(route.topic)
    ? guidePage(route.topic, requestedPage)
    : isLesson(route.topic)
      ? lessonPage(route.topic, requestedPage)
      : 0;
  if (route.topic === "support") return handoff(env, userId, eventId);
  if (route.topic === "clarify") {
    const teaching =
      context && context.topic !== "clarify" ? context : undefined;
    const streak = (stored?.clarify_streak ?? 0) + 1;
    await saveContext(
      db,
      userId,
      teaching?.topic ?? "clarify",
      teaching?.format ?? "text",
      teaching?.image_page ?? 0,
      streak,
    );
    if (streak >= 2) {
      return [
        reply("還是沒對到你的問題。要改找人工協助，或從選單再選一次嗎？", [
          command("人工協助"),
          command("選單"),
        ]),
      ];
    }
    return teaching ? teachingClarify(teaching) : noContextClarify();
  }
  await saveContext(db, userId, route.topic, route.format, imagePage, 0);
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
      env.ENVIRONMENT === "development" &&
        env.LINE_DELIVERY_MODE === "disabled",
      imagePage,
    );
  }
  if (isLesson(route.topic))
    return lessonGuide(
      route.topic,
      base,
      env.ENVIRONMENT === "development" &&
        env.LINE_DELIVERY_MODE === "disabled",
      imagePage,
    );
  return [menu()];
}
