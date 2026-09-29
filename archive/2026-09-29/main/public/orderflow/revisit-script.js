import { scenePosition } from "./revisit-model.js";

export const scenes = [
  {
    label: "再訪同一價位",
    eyebrow: "故事二 · 成交量與掛單量",
    headline: "同樣回到這裡，怎麼這次穿過去了？",
    question: "101 曾接住主動賣出。這次呢？",
    cues: [
      [70000, "價格再次接近 101。"],
      [83006, "這次跌破了。當時的買單還在嗎？"],
    ],
    done: "回看第一次承接，比較成交量與掛單量。",
    lens: "1 分鐘 K 線 · 右側尚未收盤",
  },
  {
    label: "成交發生在哪裡？",
    eyebrow: "回看 · 14:32:50",
    headline: "這個價位，成交了多少？",
    question: "按價位記錄主動買入、主動賣出的成交量。",
    cues: [
      [51200, "103：主動買入 20 隻，記在右側。"],
      [52000, "101：主動賣出 60 隻，記在左側。"],
    ],
    done: "每筆主動成交，都有另一側的被動掛單接手。",
    lens: "已成交量 · 左：主動賣出　右：主動買入",
  },
  {
    label: "同價成交，持續累加",
    eyebrow: "成交足跡 · Footprint",
    headline: "主動賣出增加，價格卻沒跌破。",
    question: "主動賣出持續成交，被動買單持續補入。",
    cues: [
      [53206, "主動賣出累計 110 隻，仍有被動掛買接手。"],
      [55500, "被動買單補入，成交量繼續累加。"],
      [58300, "101 已累計成交 200 隻 主動賣出。"],
    ],
    done: "成交足跡：按價位，分別累計主動買賣量。",
    lens: "成交足跡 · 統計 14:32:50–14:33:00",
  },
  {
    label: "各價位成交了多少？",
    eyebrow: "成交量分布 · Volume Profile",
    headline: "橫條越長，已成交量越多。",
    question: "同價主動買量與賣量相加，得到總成交量。",
    elapsedCues: [[2500, "橫條統計這 10 秒的成交，不是目前的掛單。"]],
    done: "過去成交多，不代表現在掛單多。",
    lens: "成交量分布 · 固定統計 14:32:50–14:33:00",
  },
  {
    label: "價格再次回落",
    eyebrow: "後續行情 · 14:33",
    headline: "過去成交 200 隻，現在還掛多少？",
    question: "比較過去成交量，與目前尚未成交的掛單量。",
    cues: [
      [65012, "新成交不計入過去成交量，統計範圍仍是剛才那 10 秒。"],
      [72000, "價格回落，接近 101 的被動買單。"],
    ],
    done: "101：過去成交 200 隻，目前掛買 130 隻。",
    lens: "左：過去成交量　右：目前掛單量",
  },
  {
    label: "被動買量減少",
    eyebrow: "掛單熱力圖 · Heatmap",
    headline: "掛單會撤回，成交紀錄不會。",
    question: "色帶對齊 101；越亮，當時掛買量越多。",
    cues: [
      [77000, "買量 130 → 40 隻。只有撤單，成交價未變。"],
      [79000, "主動賣出 20 隻，成交價到達色帶；掛買剩 20 隻。"],
      [81000, "再次撤量，目前只剩 12 隻 被動買單。"],
    ],
    done: "過去色帶很亮，不代表現在還有同樣的買量。",
    lens: "色帶：被動掛買量　白線：最新成交價　橫軸：時間",
  },
  {
    label: "買量耗盡，成交往下",
    eyebrow: "逐筆慢放",
    headline: "買量耗盡後，才在更低價成交。",
    question: "看主動賣出消耗最後的 12 隻 被動買單。",
    cues: [
      [83000, "12 隻 在 101 成交。買量歸零，價格仍在原位。"],
      [83006, "下一筆 16 隻 在 100 成交，價格跌破色帶。"],
      [83012, "再有 32 隻 在 99 成交，這批賣出合計 60 隻。"],
      [84800, "主動買入帶來短暫反彈。"],
    ],
    done: "過去成交 200 隻，這次跌破前只剩 12 隻 掛買。",
    lens: "色帶：被動掛買量　白線：最新成交價　橫軸：時間",
  },
  {
    label: "跌破之後",
    eyebrow: "回到 K 線",
    headline: "跌破之後，成交繼續。",
    question: "觀察更低價位的被動買單。",
    cues: [
      [86000, "99 補入新的被動買單。"],
      [89400, "價格仍在 101 下方，這根 K 線尚未收盤。"],
    ],
    done: "再次回到同一價位，要看當時的掛單與成交。",
    lens: "1 分鐘 K 線 · 播至 14:33:30，尚未收盤",
  },
  {
    label: "成交量與掛單量",
    eyebrow: "重播 · 14:33:00–30",
    headline: "過去的成交量，現在的掛單量。",
    question: "同一價位，過去成交與目前掛單是兩件事。",
    cues: [
      [75000, "200 隻 是過去成交量；目前掛買只有 130 隻。"],
      [77000, "掛單撤離，不會直接改變成交價。"],
      [83006, "買單耗盡，後續主動賣出在更低價成交。"],
    ],
    finalHeadline: "過去成交很多，不代表現在仍有人接。",
    done: "成交足跡、成交量分布看已成交量；熱力圖看可見掛單的變化。",
    lens: "同一段行情 · 回看 14:33:00–14:33:30",
  },
];

export function narrativeAt(scene, elapsed, reduced = false) {
  const s = scenes[scene];
  const p = scenePosition(scene, elapsed, reduced);
  let question = s.question;
  if (!p.mode.includes("rewind") && p.mode !== "approach") {
    for (const [at, cue] of s.cues ?? []) if (p.time >= at) question = cue;
    for (const [at, cue] of s.elapsedCues ?? [])
      if (p.elapsed >= at) question = cue;
  }
  return {
    headline: p.progress === 1 ? (s.finalHeadline ?? s.headline) : s.headline,
    question: p.progress === 1 ? s.done : question,
  };
}
