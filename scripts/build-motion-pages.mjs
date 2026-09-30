// Generate the lesson page for every catalog course in the motion format.
// The page is the academy shell (header, sidebar, heading) around a
// <section class="motion-player">; build-academy.mjs then injects the course
// navigation, prerequisites and shared mobile assets as for any lesson.
import { writeFile, access } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { courses, kinds, isAvailable, durationLabel } from "../public/orderflow/academy-catalog.js";

const root = "public/orderflow/";
const escape = (s) =>
  String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

export function motionPage(course, lesson) {
  const k = kinds[course.kind];
  const kind = k.label;
  const label = `${k.code} ${course.number}`;
  const chapters = lesson.chapters
    .map(
      (c, i) =>
        `\n          <button type="button" data-story-scene="${i}"${i === 0 ? ' aria-current="step"' : ""}>\n            <i></i>${escape(c.label)}\n          </button>`,
    )
    .join("");
  const note = escape(lesson.note ?? course.subtitle).replace(/\n/g, "<br />");
  const order = courses.filter(isAvailable);
  const at = order.findIndex((c) => c.id === course.id);
  const pagerLink = (c, dir) =>
    c
      ? `<a class="pager-${dir}" href="${c.href}"><small>${dir === "prev" ? "← 上一課" : "下一課 →"} · ${kinds[c.kind].label} ${c.number}</small><strong>${escape(c.title)}</strong><span>${escape(c.subtitle)} · ${durationLabel(c.duration)}</span></a>`
      : `<a class="pager-${dir}" href="./courses.html"><small>${dir === "prev" ? "← 回到" : "看完了 →"}</small><strong>課程地圖</strong><span>自由選看全部課程</span></a>`;
  return `<!doctype html>
<html lang="zh-Hant" class="wick-page">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="theme-color" content="#05090f" />
    <meta
      name="description"
      content="${escape(course.description)} 約 ${Math.round(lesson.duration)} 秒的${k.format}。"
    />
    <title>${escape(course.title)} · MetaBear</title>
    <link rel="icon" href="/metabear-logo-transparent-64.png" />
    <link rel="stylesheet" href="./motion/fonts/fonts.css" />
    <link rel="stylesheet" href="/mb.css" />
    <link rel="stylesheet" href="./motion/motion.css" />
    <link rel="stylesheet" href="./lesson.css" />
    <script src="/mb-boot.js"></script>
    <script type="module" src="./academy-navigation.js"></script>
    <script type="module" src="./motion/boot.js"></script>
    <script type="module" src="./lesson-page.js"></script>
  </head>
  <body data-chapter="${course.id}" data-lesson-style="compact" data-format="motion" class="mb-grain">
    <a class="skip" href="#story">跳到${escape(course.title)}動態課程</a>
    <header class="site-header mb-header lesson-header" data-header>
      <a href="/" class="brand mb-brand"><img src="/metabear-logo-transparent-64.png" width="34" height="34" alt="" /><span>MetaBear<small>ORDERFLOW ACADEMY</small></span></a>
      <p class="series crumbs"><a href="./courses.html">互動學院</a><span aria-hidden="true">/</span>${kind}<span aria-hidden="true">/</span><strong>${escape(course.title)}</strong></p>
      <a class="mb-btn ghost small header-map" href="./courses.html">課程地圖 <span class="arrow" aria-hidden="true">↗</span></a>
    </header>
    <aside class="lesson-sidebar" aria-label="課程導覽">
      <a class="academy-home" href="./courses.html"
        >互動學院 <span>ACADEMY</span></a
      >
      <p class="sidebar-label">從一筆成交，讀懂市場</p>
      <nav class="course-menu" aria-label="學院課程"><nav class="chapter-menu" aria-label="${escape(course.title)}章節">${chapters}
        </nav></nav>
      <div class="sidebar-note">
        <span class="note-orbit">↗</span>
        <p>${note}</p>
      </div>
    </aside>
    <main id="story">
      <div class="lesson-heading">
        <div>
          <p>${label} <span>／</span> ${escape(course.subtitle)}</p>
          <h2>${escape(course.title)}</h2>
        </div>
        <span class="lesson-format"
          ><i></i> ${k.format} <span>${durationLabel(lesson.duration)}</span></span
        >
      </div>
      <section
        class="motion-player"
        data-lesson="${course.id}"
        aria-label="${escape(course.title)} 動態課程"
      ></section>
      <p class="motion-note">${escape(lesson.footer ?? "教學用合成行情，數字僅供理解機制。")}</p>
      <nav class="lesson-pager" aria-label="上一課與下一課">
        ${pagerLink(order[at - 1], "prev")}
        ${pagerLink(order[at + 1], "next")}
      </nav>
    </main>
    <footer class="lesson-foot">
      <span>空白鍵播放／暫停，←→ 快轉回看，F 全螢幕，M 聲音。</span
      ><span>MetaBear 互動學院</span>
    </footer>
    <noscript>請啟用 JavaScript 觀看動態課程。</noscript>
  </body>
</html>
`;
}

export async function buildMotionPages() {
  for (const course of courses.filter((c) => c.format === "motion" && isAvailable(c))) {
    const file = resolve(root, "motion/lessons", `${course.id}.js`);
    try {
      await access(file);
    } catch {
      throw Error(`Motion lesson is missing: ${file}`);
    }
    const { lesson } = await import(pathToFileURL(file).href);
    if (lesson.id !== course.id) throw Error(`Lesson id mismatch: ${course.id} ≠ ${lesson.id}`);
    await writeFile(root + course.href.slice(2), motionPage(course, lesson));
  }
}
