import { HttpError, json, readJson, textField, choice } from "./http";
export type KnowledgeArticle = {
  id: string;
  title: string;
  keywords: string;
  answer: string;
  requires_support: number;
  status: string;
  source_note: string;
  revision: number;
  updated_at: string;
};
export async function publishedKnowledge(
  db: D1Database,
): Promise<KnowledgeArticle[]> {
  return (
    await db
      .prepare(
        "SELECT * FROM knowledge_articles WHERE status='published' ORDER BY id LIMIT 100",
      )
      .all<KnowledgeArticle>()
  ).results;
}
export function matchKnowledge(
  text: string,
  articles: KnowledgeArticle[],
  contextTopic?: string,
): KnowledgeArticle | undefined {
  const normalized = text.replace(/\s/g, "").toLowerCase();
  if (/^(那|所以)?(該|要)?怎麼辦[?？!！。]*$/.test(normalized))
    return articles.find((a) => "kb:" + a.id === contextTopic);
  if (
    contextTopic?.startsWith("kb:referral-") &&
    /^(那|所以)?(我)?(可以|能|能不能|可不可以)(改|更改|修改|轉移|換)(嗎|呢|掉)?[?？!！。]*$/.test(
      normalized,
    )
  )
    return articles.find((a) => a.id === "referral-change");
  return articles
    .map((a) => ({
      a,
      score: Math.max(
        a.title === text ? 1000 : 0,
        ...a.keywords
          .split(/\n|\\n/)
          .map((k) =>
            normalized.includes(k.trim().toLowerCase()) && k.trim().length >= 2
              ? k.trim().length
              : 0,
          ),
      ),
    }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)[0]?.a;
}
export async function knowledgeApi(
  request: Request,
  env: Env,
  email: string,
): Promise<Response | null> {
  const path = new URL(request.url).pathname;
  if (!path.startsWith("/api/knowledge")) return null;
  if (path === "/api/knowledge" && request.method === "GET")
    return json(
      (
        await env.DB.prepare(
          "SELECT * FROM knowledge_articles ORDER BY updated_at DESC,id",
        ).all()
      ).results,
    );
  const match = /^\/api\/knowledge\/([a-z0-9-]{1,64})$/.exec(path);
  const create = path === "/api/knowledge" && request.method === "POST";
  if (!create && (!match || request.method !== "PUT"))
    throw new HttpError(405, "Method not allowed");
  const body = await readJson(request);
  const id = create ? crypto.randomUUID() : match![1];
  const title = textField(body.title, 150).trim();
  const answer = textField(body.answer, 3000).trim();
  const keywords = textField(body.keywords, 1000).trim();
  const source = textField(body.source_note, 1000).trim();
  const status = choice(body.status, ["draft", "published"]);
  if (typeof body.requires_support !== "boolean")
    throw new HttpError(400, "請選擇是否需要人工核實");
  if (!title || !answer || (status === "published" && !source))
    throw new HttpError(400, "請填寫問題、解法與發布依據");
  if (keywords.split("\n").filter(Boolean).length > 30)
    throw new HttpError(400, "每則最多 30 個關鍵詞");
  if (create) {
    const count = await env.DB.prepare(
      "SELECT count(*) AS n FROM knowledge_articles",
    ).first<{ n: number }>();
    if ((count?.n || 0) >= 100)
      throw new HttpError(400, "目前最多 100 則知識，請整理既有項目");
    await env.DB.prepare(
      "INSERT INTO knowledge_articles(id,title,keywords,answer,requires_support,status,source_note) VALUES (?,?,?,?,?,?,?)",
    )
      .bind(
        id,
        title,
        keywords,
        answer,
        body.requires_support ? 1 : 0,
        status,
        source,
      )
      .run();
  } else {
    if (!Number.isSafeInteger(body.revision) || Number(body.revision) < 1)
      throw new HttpError(400, "版本不正確");
    const result = await env.DB.prepare(
      "UPDATE knowledge_articles SET title=?,keywords=?,answer=?,requires_support=?,status=?,source_note=?,revision=revision+1,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=? AND revision=?",
    )
      .bind(
        title,
        keywords,
        answer,
        body.requires_support ? 1 : 0,
        status,
        source,
        id,
        Number(body.revision),
      )
      .run();
    if (result.meta.changes !== 1)
      throw new HttpError(409, "此項已更新，請重新載入後再儲存");
  }
  await env.DB.prepare(
    "INSERT INTO audit_log(action,detail) VALUES ('knowledge.update',?)",
  )
    .bind(JSON.stringify({ actor: email, id, status }))
    .run();
  return json(
    await env.DB.prepare("SELECT * FROM knowledge_articles WHERE id=?")
      .bind(id)
      .first(),
  );
}
