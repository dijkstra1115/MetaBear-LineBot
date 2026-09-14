import { command, link, navigation } from "./content";
import type { KnowledgeArticle } from "./knowledge";
import type { Action, LineMessage } from "./types";
import seed from "../data/bingx-faq.json";

const groups: Record<string, string> = {
  login: "登入與驗證碼問題",
  kyc: "身分認證問題",
  deposit: "充值與提幣問題",
  community: "推薦碼與社群問題",
};

// Only published database content is offered; withdrawn seeds never reappear.
export async function faqMenu(
  db: D1Database,
  text: string,
): Promise<LineMessage[] | null> {
  if (/^(常見問題|FAQ)$/i.test(text))
    return [
      navigation(
        [
          ...Object.values(groups).map((label) => command(label)),
          command("選單"),
        ],
        "你遇到哪一類問題？",
      ),
    ];
  const group = Object.entries(groups).find(([, label]) => label === text)?.[0];
  if (!group) return null;
  const ids = seed.filter((a) => a.group === group).map((a) => a.id);
  if (group === "community") ids.push("deposit-review");
  const rows = await db
    .prepare(
      `SELECT title FROM knowledge_articles WHERE status='published' AND id IN (${ids.map(() => "?").join(",")}) ORDER BY title`,
    )
    .bind(...ids)
    .all<{ title: string }>();
  return [
    navigation(
      [
        ...rows.results.map((a) => command(a.title.slice(0, 20), a.title)),
        command("常見問題"),
        command("人工協助"),
        command("選單"),
      ],
      rows.results.length ? text : "這一類問題正在更新，你也可以直接描述問題。",
    ),
  ];
}

export function knowledgeActions(article: KnowledgeArticle): Action[] {
  const actions: Action[] = [];
  if (article.id === "bingx-code-channel")
    actions.push(
      command("Email 收不到", "收不到 Email 驗證碼"),
      command("簡訊收不到", "收不到手機簡訊驗證碼"),
      command("Google 驗證碼錯誤", "Google 驗證碼一直錯誤"),
    );
  const raw = article.source_note.match(/https:\/\/[^\s]+/)?.[0];
  if (raw) {
    try {
      const url = new URL(raw);
      if (
        [
          "bingx.com",
          "www.bingx.com",
          "support.bingx.com",
          "bingxservice.zendesk.com",
        ].includes(url.hostname) &&
        !url.username &&
        !url.password
      )
        actions.push(link("BingX 官方說明", url.href));
    } catch {
      /* Older free-form source notes need not contain a URL. */
    }
  }
  if (article.id === "bingx-uid-location") actions.push(command("提交 UID"));
  if (article.id === "deposit-review")
    actions.push(command("我的進度"), command("重新查詢"));
  actions.push(command("常見問題"), command("人工協助"), command("選單"));
  return actions;
}
