import { readFile, writeFile } from "node:fs/promises";
import {
  courses,
  selectCourses,
  isAvailable,
  durationLabel,
} from "../public/orderflow/academy-catalog.js";
import {
  renderSections,
  renderPaths,
  renderLessonNavigation,
  renderPrerequisites,
} from "../public/orderflow/academy-map-render.js";

function replaceElement(html, marker, replacement) {
  const at = html.indexOf(marker);
  if (at < 0) return html;
  const start = html.lastIndexOf("<", at);
  const tag = /^<([a-z]+)/.exec(html.slice(start))?.[1];
  if (!tag) throw Error(`Invalid academy element: ${marker}`);
  const pattern = new RegExp(`<\\/?${tag}\\b[^>]*>`, "g");
  pattern.lastIndex = start;
  let depth = 0;
  for (let match; (match = pattern.exec(html));) {
    depth += match[0].startsWith("</") ? -1 : 1;
    if (depth === 0)
      return html.slice(0, start) + replacement + html.slice(pattern.lastIndex);
  }
  throw Error(`Unclosed academy element: ${marker}`);
}

export async function buildAcademy() {
  const root = "public/orderflow/";
  for (const course of courses.filter(isAvailable)) {
    const path = root + course.href.slice(2);
    let html;
    try {
      html = await readFile(path, "utf8");
    } catch (error) {
      if (error.code === "ENOENT")
        throw Error(`Available lesson is missing: ${path}`);
      throw error;
    }
    if (!html.includes('class="course-menu"')) continue;
    html = html
      .replace(
        /<title>[^<]*<\/title>/,
        `<title>${course.title} · MetaBear</title>`,
      )
      .replace(
        /(<div class="lesson-heading">[\s\S]*?<h2>)[\s\S]*?(<\/h2>)/,
        `$1${course.title}$2`,
      )
      .replace(
        /\b(?:CONCEPT|STORY) \d{2}/g,
        `${course.kind === "concept" ? "CONCEPT" : "STORY"} ${course.number}`,
      )
      .replace(
        /(<span class="lesson-format"[\s\S]*?<i><\/i>\s*)動態(?:圖解|故事)/,
        (_, opening) =>
          opening + (course.kind === "concept" ? "動態圖解" : "動態故事"),
      )
      .replace(
        /(<span class="lesson-format"[\s\S]*?<span>)[^<]+(<\/span>)/,
        `$1${durationLabel(course.duration)}$2`,
      );
    const chapters =
      /<nav class="chapter-menu"[\s\S]*?<\/nav>/.exec(html)?.[0] ?? "";
    html = replaceElement(
      html,
      'class="course-menu"',
      `<nav class="course-menu" aria-label="學院課程">${renderLessonNavigation(course.id, chapters)}</nav>`,
    );
    html = html
      .replace(
        /(<a\b[^>]*class="academy-home"[^>]*href=")[^"]*(")/,
        "$1./courses.html$2",
      )
      .replace(
        /(<a\b[^>]*href=")[^"]*("[^>]*class="academy-home")/,
        "$1./courses.html$2",
      );
    const prerequisites = renderPrerequisites(course.id);
    if (html.includes('class="lesson-prerequisite"'))
      html = replaceElement(html, 'class="lesson-prerequisite"', prerequisites);
    else if (prerequisites)
      html = html.replace(
        '<div class="sidebar-note">',
        prerequisites + '<div class="sidebar-note">',
      );
    if (!html.includes('src="./academy-navigation.js"'))
      html = html.replace(
        '<script type="module"',
        '<script type="module" src="./academy-navigation.js"></script>\n    <script type="module"',
      );
    for (const sheet of ["academy-mobile.css", "academy-navigation.css"])
      if (!html.includes(`href="./${sheet}"`))
        html = html.replace(
          "</head>",
          `  <link rel="stylesheet" href="./${sheet}" />\n  </head>`,
        );
    if (!html.includes('src="./academy-mobile.js"'))
      html = html.replace(
        "</head>",
        '  <script type="module" src="./academy-mobile.js"></script>\n  </head>',
      );
    await writeFile(path, html);
  }
  let map = await readFile(root + "courses.html", "utf8");
  const counts = {
    "available-count": courses.filter(isAvailable).length,
    "new-count": courses.filter((course) => course.status === "new").length,
    "planned-count": courses.filter((course) => !isAvailable(course)).length,
  };
  for (const [id, count] of Object.entries(counts)) {
    map = map.replace(
      new RegExp(`(id="${id}">)\\d+`),
      (_, opening) => opening + count,
    );
  }
  map = map
    .replace(
      /(id="filter-result"[^>]*>)[^<]*/,
      `$1${counts["available-count"]} 堂可觀看課程`,
    )
    .replace(
      /<!-- paths:start -->[\s\S]*?<!-- paths:end -->/,
      `<!-- paths:start -->${renderPaths()}<!-- paths:end -->`,
    )
    .replace(
      /<!-- courses:start -->[\s\S]*?<!-- courses:end -->/,
      `<!-- courses:start -->${renderSections(selectCourses())}<!-- courses:end -->`,
    );
  await writeFile(root + "courses.html", map);
  await writeFile(
    root + "index.html",
    map.replace("./academy-map.js", "./academy-entry.js"),
  );
}
