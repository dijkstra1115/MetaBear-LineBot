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
  // Request-local aliases participate in both retrieval and final matching.
  matching_phrases?: string[];
};
export const normalizeKnowledge = (value: string) =>
  value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "");

function phrases(article: KnowledgeArticle, aliases: string[] = []) {
  return [article.title, ...article.keywords.split(/\n|\\n/), ...aliases]
    .map((value) => value.trim())
    .filter((value) => value.length >= 2);
}

function lexicalScore(
  text: string,
  article: KnowledgeArticle,
  aliases: string[],
  contextTopic?: string,
) {
  const normalized = normalizeKnowledge(text);
  if (!normalized) return 0;
  let score = normalizeKnowledge(article.title) === normalized ? 1000 : 0;
  for (const phrase of phrases(article, aliases)) {
    const key = normalizeKnowledge(phrase);
    if (!key) continue;
    if (normalized.includes(key)) score = Math.max(score, 100 + key.length * 4);
    else if (key.includes(normalized) && normalized.length >= 4)
      score = Math.max(score, 60 + normalized.length * 2);
  }
  if (contextTopic === "kb:" + article.id) score += 25;
  return score;
}

export async function knowledgeCandidates(
  db: D1Database,
  text: string,
  contextTopic?: string,
  limit = 5,
): Promise<KnowledgeArticle[]> {
  const [articleRows, aliasRows] = await Promise.all([
    db
      .prepare(
        "SELECT * FROM knowledge_articles WHERE status='published' ORDER BY updated_at DESC,id LIMIT 500",
      )
      .all<KnowledgeArticle>(),
    db
      .prepare(
        "SELECT article_id,phrase FROM knowledge_aliases ORDER BY weight DESC,phrase",
      )
      .all<{ article_id: string; phrase: string }>(),
  ]);
  const aliases = new Map<string, string[]>();
  for (const row of aliasRows.results)
    aliases.set(row.article_id, [
      ...(aliases.get(row.article_id) ?? []),
      row.phrase,
    ]);
  return articleRows.results
    .map((article) => ({
      article: { ...article, matching_phrases: aliases.get(article.id) ?? [] },
      score: lexicalScore(
        text,
        article,
        aliases.get(article.id) ?? [],
        contextTopic,
      ),
    }))
    .filter(({ score }) => score > 0)
    .sort(
      (a, b) =>
        b.score - a.score ||
        b.article.updated_at.localeCompare(a.article.updated_at),
    )
    .slice(0, Math.max(1, Math.min(10, limit)))
    .map(({ article }) => article);
}
export function matchKnowledge(
  text: string,
  articles: KnowledgeArticle[],
  contextTopic?: string,
): KnowledgeArticle | undefined {
  const normalized = normalizeKnowledge(text);
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
        normalizeKnowledge(a.title) === normalized ? 1000 : 0,
        ...phrases(a, a.matching_phrases)
          .filter(
            (k) =>
              !/^(可以改嗎|能改嗎)$/.test(k) ||
              contextTopic?.startsWith("kb:referral-"),
          )
          .map((k) =>
            normalized.includes(normalizeKnowledge(k)) &&
            normalizeKnowledge(k).length >= 2
              ? normalizeKnowledge(k).length
              : 0,
          ),
      ),
    }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)[0]?.a;
}

function aliasStatements(
  db: D1Database,
  articleId: string,
  title: string,
  keywords: string,
) {
  const values = [
    ...new Set([title, ...keywords.split(/\n|\\n/)].map((x) => x.trim())),
  ]
    .filter((x) => x.length >= 2)
    .slice(0, 31);
  return [
    db
      .prepare("DELETE FROM knowledge_aliases WHERE article_id=? AND managed=1")
      .bind(articleId),
    ...values.map((phrase, index) =>
      db
        .prepare(
          "INSERT INTO knowledge_aliases(article_id,phrase,normalized,weight,managed) VALUES (?,?,?,?,1) ON CONFLICT(article_id,normalized) DO UPDATE SET phrase=excluded.phrase,weight=excluded.weight",
        )
        .bind(
          articleId,
          phrase,
          normalizeKnowledge(phrase),
          index === 0 ? 20 : 10,
        ),
    ),
  ];
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
    if ((count?.n || 0) >= 500)
      throw new HttpError(400, "目前最多 500 則知識，請整理或封存既有項目");
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
    await env.DB.batch([
      ...aliasStatements(env.DB, id, title, keywords),
      env.DB.prepare(
        "INSERT INTO knowledge_versions(article_id,revision,title,keywords,answer,requires_support,status,source_note,actor) VALUES (?,1,?,?,?,?,?,?,?)",
      ).bind(
        id,
        title,
        keywords,
        answer,
        body.requires_support ? 1 : 0,
        status,
        source,
        email,
      ),
    ]);
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
    await env.DB.batch([
      ...aliasStatements(env.DB, id, title, keywords),
      env.DB.prepare(
        "INSERT INTO knowledge_versions(article_id,revision,title,keywords,answer,requires_support,status,source_note,actor) VALUES (?,?,?,?,?,?,?,?,?)",
      ).bind(
        id,
        Number(body.revision) + 1,
        title,
        keywords,
        answer,
        body.requires_support ? 1 : 0,
        status,
        source,
        email,
      ),
    ]);
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
