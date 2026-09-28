// Generate the lesson page for every catalog course in the motion format.
// The page is the academy shell (header, sidebar, heading) around a
// <section class="motion-player">; build-academy.mjs then injects the course
// navigation, prerequisites and shared mobile assets as for any lesson.
import { writeFile, access } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { courses, isAvailable, durationLabel } from "../public/orderflow/academy-catalog.js";

const root = "public/orderflow/";
const escape = (s) =>
  String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

export function motionPage(course, lesson) {
  const concept = course.kind === "concept";
  const kind = concept ? "名詞圖解" : "市場故事";
  const label = `${concept ? "CONCEPT" : "STORY"} ${course.number}`;
  const chapters = lesson.chapters
    .map(
      (c, i) =>
        `\n          <button type="button" data-story-scene="${i}"${i === 0 ? ' aria-current="step"' : ""}>\n            <i></i>${escape(c.label)}\n          </button>`,
    )
    .join("");
  const note = escape(lesson.note ?? course.subtitle).replace(/\n/g, "<br />");
  return `<!doctype html>
<html lang="zh-Hant" class="wick-page">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="theme-color" content="#0b1218" />
    <meta
      name="description"
      content="${escape(course.description)} 約 ${Math.round(lesson.duration)} 秒的動態${concept ? "圖解" : "故事"}。"
    />
    <title>${escape(course.title)} · MetaBear</title>
    <link rel="icon" href="/favicon-v2.png" />
    <link rel="stylesheet" href="./wick.css" />
    <link rel="stylesheet" href="./primer-desktop.css" />
    <link rel="stylesheet" href="./motion/fonts/fonts.css" />
    <link rel="stylesheet" href="./motion/motion.css" />
    <script type="module" src="./academy-navigation.js"></script>
    <script type="module" src="./motion/boot.js"></script>
  </head>
  <body data-chapter="${course.id}" data-lesson-style="compact" data-format="motion">
    <a class="skip" href="#story">跳到${escape(course.title)}動態課程</a>
    <header class="site-header">
      <a href="/" class="brand"
        ><img src="/favicon-v2.png" width="28" height="28" alt="" /><span
          >MetaBear</span
        ></a
      >
      <span class="series"
        >${kind} <span aria-hidden="true">/</span> ${escape(course.subtitle)}</span
      >
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
          ><i></i> ${concept ? "動態圖解" : "動態故事"} <span>${durationLabel(lesson.duration)}</span></span
        >
      </div>
      <section
        class="motion-player"
        data-lesson="${course.id}"
        aria-label="${escape(course.title)} 動態課程"
      ></section>
      <p class="motion-note">${escape(lesson.footer ?? "教學用合成行情，數字僅供理解機制。")}</p>
    </main>
    <footer>
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
