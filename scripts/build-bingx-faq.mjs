import fs from "node:fs";

// This migration is an immutable reviewed seed, not a recurring website scraper.
// After deployment, publish future corrections through the CRM or a new migration.
const articles = JSON.parse(
  fs.readFileSync(new URL("../data/bingx-faq.json", import.meta.url), "utf8"),
);
const quote = (value) => "'" + String(value).replaceAll("'", "''") + "'";
const statements = [
  "-- Reviewed BingX FAQ seed, checked 2026-09-14. Preserve administrator edits.",
];
for (const article of articles) {
  const { id, title, answer, source_url, source_updated, checked_at } = article;
  const keywords = article.keywords.join("\n");
  const note = `來源：${source_url}\n官方頁更新：${source_updated}\n查核：${checked_at}\n範圍：BingX 官方操作摘要；涉及 MetaBear 的段落為本團隊流程。費率、限額與個案結果以帳戶及官方核實為準。`;
  if (title.length > 20 || answer.length > 800 || note.length > 1000)
    throw new Error(`Oversized FAQ: ${id}`);
  const values = [
    title,
    keywords,
    answer,
    Number(article.requires_support),
    "published",
    note,
  ].map(quote);
  if (article.replace_if_source) {
    statements.push(
      `UPDATE knowledge_articles SET ${["title", "keywords", "answer", "requires_support", "status", "source_note"].map((key, i) => key + "=" + values[i]).join(",")},revision=revision+1,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=${quote(id)} AND revision=1 AND status='published' AND source_note=${quote(article.replace_if_source)};`,
    );
  } else {
    statements.push(
      `INSERT OR IGNORE INTO knowledge_articles(id,title,keywords,answer,requires_support,status,source_note) VALUES (${[quote(id), ...values].join(",")});`,
    );
  }
  statements.push(
    `INSERT OR IGNORE INTO knowledge_versions(article_id,revision,title,keywords,answer,requires_support,status,source_note,actor) SELECT id,revision,title,keywords,answer,requires_support,status,source_note,'bingx-faq-2026-09-14' FROM knowledge_articles WHERE id=${quote(id)} AND source_note=${quote(note)};`,
  );
}
const output = statements.join("\n\n") + "\n";
const destination = new URL(
  "../migrations/0011_bingx_faq.sql",
  import.meta.url,
);
if (process.argv.includes("--check")) {
  if (fs.readFileSync(destination, "utf8") !== output)
    throw new Error("FAQ seed and migration differ");
} else fs.writeFileSync(destination, output);
