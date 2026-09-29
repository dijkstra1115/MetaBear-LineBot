import { TIMING, clamp, ease } from "./breakout-volume-model.js";

const C = {
  ink: "#e1ebe7",
  muted: "#829ca3",
  faint: "#506970",
  grid: "#2b4148",
  buy: "#9edecb",
  sell: "#dfbc88",
  panel: "#101b20",
};
const mid = 'text-anchor="middle"',
  end = 'text-anchor="end"',
  num = 'class="number"';
const text = (x, y, s, c = C.muted, z = 11, a = "") =>
  `<text x="${x}" y="${y}" fill="${c}" font-size="${z}" ${a}>${s}</text>`;
const rect = (x, y, w, h, c, a = "") =>
  `<rect x="${x}" y="${y}" width="${Math.max(0, w)}" height="${Math.max(0, h)}" fill="${c}" ${a}/>`;
const line = (x, y, x2, y2, c = C.grid, a = "") =>
  `<line x1="${x}" y1="${y}" x2="${x2}" y2="${y2}" stroke="${c}" ${a}/>`;
const group = (s, o = 1, a = "") => `<g opacity="${clamp(o)}" ${a}>${s}</g>`;
const mix = (a, b, t) => a + (b - a) * t;
export const worldX = (x) => 70 + x * 82;
export const candleX = (index) => worldX(index + 0.5);
export const priceY = (p) => 235 - (p - 98) * 13;
export const volumeY = (v) => 323 - v * 0.13;

export function cameraAt(t, reduced = false) {
  const into = reduced
    ? Number(t >= TIMING.focused)
    : ease((t - TIMING.zoomIn) / (TIMING.focused - TIMING.zoomIn));
  const out = reduced
    ? Number(t >= TIMING.panorama)
    : ease((t - TIMING.zoomOut) / (TIMING.panorama - TIMING.zoomOut));
  const pan = reduced
    ? t >= 30000
      ? 1
      : t >= 22000
        ? 0.8
        : t >= 19000
          ? 0.6
          : t >= 13000
            ? 0.3
            : 0
    : ease((t - 12000) / 19000);
  const focus = into * (1 - out),
    scale = 1 + 0.85 * focus,
    center = mix(500, 560 + 200 * pan, focus);
  return {
    focus,
    scale,
    center,
    out,
    x: (v) => 500 + (worldX(v) - center) * scale,
    y: (p) => mix(priceY(p), 235 - (p - 101) * 19.5, focus),
  };
}

export function drawBreakoutVolume({
  story,
  state,
  playhead,
  reduced = false,
}) {
  const t = playhead,
    cam = cameraAt(t, reduced),
    show = (at, d = 600) => (reduced ? Number(t >= at) : ease((t - at) / d));
  const detail = cam.focus,
    history = show(TIMING.focused),
    current = state.currentBar;
  const heatAlpha = history * (0.86 * detail + 0.34 * cam.out),
    cvdAlpha = history;
  const phase =
    t < 7000
      ? "10 根已完成行情 · 選段回看"
      : t < 13000
        ? "主動買入 · 穿過 104"
        : t < 19000
          ? "突破上方 · 持續成交"
          : t < 22000
            ? "主動賣出 · 回到 104"
            : t < 30000
              ? "104 掛買 · 接住主動賣出"
              : t < 36000
                ? "後續買入 · 再往上成交"
                : "原壓力 → 回踩承接 → 再上";
  let svg =
    '<defs><clipPath id="retest-price"><rect x="68" y="57" width="837" height="190"/></clipPath><clipPath id="retest-volume"><rect x="68" y="271" width="837" height="58"/></clipPath><clipPath id="retest-cvd"><rect x="68" y="338" width="837" height="63"/></clipPath></defs>';
  svg +=
    text(
      62,
      25,
      "BREAKOUT / RETEST / ABSORPTION",
      C.muted,
      10,
      'letter-spacing="1.7"',
    ) + text(939, 25, phase, C.muted, 10, end);
  svg += group(
    text(62, 46, "足跡：左主動賣出｜右主動買入", C.muted, 9) +
      text(939, 46, "掛買色帶：越亮，等待量越多", C.buy, 9, end),
    history,
  );
  for (let p = 98; p <= 110; p++) {
    const y = cam.y(p);
    if (y < 60 || y > 240) continue;
    svg +=
      line(
        68,
        y,
        905,
        y,
        C.grid,
        'stroke-opacity=".35" stroke-dasharray="2 6"',
      ) +
      text(
        925,
        y + 3,
        p,
        p === 104 ? (t >= 22000 ? C.buy : C.sell) : C.faint,
        9,
        num,
      );
  }
  let heat = "";
  for (const s of state.heatSegments ?? []) {
    // Background candles keep their trades, but only the replay's book is drawn.
    if (s.startAt < TIMING.reset) continue;
    const x0 = cam.x(s.x0),
      x1 = cam.x(s.x1),
      y = cam.y(s.price);
    if (x1 < 68 || x0 > 905 || y < 54 || y > 250 || s.size <= 0) continue;
    const isBid = s.side === "buy";
    heat += rect(
      x0,
      y - 7 * (1 + 0.4 * detail),
      x1 - x0,
      14 * (1 + 0.4 * detail),
      isBid ? C.buy : C.sell,
      `opacity="${isBid ? 0.06 + 0.48 * clamp(s.size / 160) : 0.09}" data-heat-price="${s.price}" data-heat-size="${s.size}"`,
    );
  }
  svg += group(heat, heatAlpha, 'clip-path="url(#retest-price)"');
  svg += line(
    68,
    cam.y(104),
    905,
    cam.y(104),
    t < 22000 ? C.sell : C.buy,
    `stroke-opacity=".5" stroke-dasharray="4 5"`,
  );
  let candles = "",
    volumes = "",
    times = "";
  for (const b of state.bars) {
    if (!b) continue;
    const x = cam.x(b.index + 0.5),
      fp = b.index >= 5,
      half = (fp ? mix(9, 29, detail) : 9) * cam.scale;
    const edge = Math.min(
      clamp((x - half - 68) / 15),
      clamp((905 - x - half) / 15),
    );
    const alpha = edge * (b.index < 5 ? 1 - detail * 0.86 : 1);
    if (x < 20 || x > 950) continue;
    const color = b.close >= b.open ? C.buy : C.sell,
      bodyY = Math.min(cam.y(b.open), cam.y(b.close));
    const width = mix(13, 5, detail) * cam.scale;
    let body =
      line(x, cam.y(b.high), x, cam.y(b.low), color, 'stroke-width="1.3"') +
      rect(
        x - width / 2,
        bodyY - 1,
        width,
        Math.max(2, Math.abs(cam.y(b.open) - cam.y(b.close))),
        color,
        'rx="1" fill-opacity=".85"',
      );
    if (fp) {
      let cells = "";
      for (const row of b.footprint ?? []) {
        const y = cam.y(row.price),
          w = 23 * cam.scale,
          h = 11 + 5 * detail;
        for (const [side, qty, imb, offset] of [
          ["sell", row.bid, row.sellImbalance, -29],
          ["buy", row.ask, row.buyImbalance, 6],
        ]) {
          const cx = x + offset * cam.scale,
            color = side === "buy" ? C.buy : C.sell;
          const fresh =
            state.replay &&
            state.latestTrade?.barIndex === b.index &&
            state.latestTrade.price === row.price &&
            state.latestTrade.side === side &&
            t - state.latestTrade.at < 650;
          cells +=
            rect(
              cx,
              y - h / 2,
              w,
              h,
              imb ? color : C.panel,
              `rx="2" fill-opacity="${imb ? 0.2 : 0.88}" stroke="${color}" stroke-opacity="${fresh ? 0.95 : imb ? 0.55 : 0.13}"`,
            ) +
            text(
              cx + w / 2,
              y + 3.2,
              qty || "·",
              imb ? color : qty ? C.ink : C.faint,
              10 + detail * 2,
              `${mid} ${num} data-footprint="${b.index}:${row.price}:${side}" data-volume="${qty}"`,
            );
        }
      }
      body += group(cells, detail);
    }
    candles += group(
      body,
      alpha,
      `data-bar="${b.index}" data-open="${b.open}" data-high="${b.high}" data-low="${b.low}" data-close="${b.close}"`,
    );
    if (x > 85 && x < 895) {
      times += group(
        text(
          x,
          259,
          b.label,
          b.index === state.activeBarIndex ? C.ink : C.muted,
          9,
          `${mid} ${num}`,
        ),
        alpha,
      );
      const w = 26 * cam.scale;
      volumes += group(
        rect(
          x - w / 2,
          volumeY(b.volume),
          w,
          b.volume * 0.13,
          color,
          `rx="2" fill-opacity="${fp ? 0.68 : 0.3}" data-volume-index="${b.index}" data-volume="${b.volume}"`,
        ) +
          text(
            x,
            volumeY(b.volume) - 5,
            b.volume,
            fp ? C.ink : C.muted,
            11,
            `${mid} ${num}`,
          ),
        alpha,
      );
    }
  }
  svg += group(candles, 1, 'clip-path="url(#retest-price)"') + times;
  if (t < 7000 || t >= 36000) {
    const a = 1 - detail;
    svg += group(
      text(cam.x(5.5), 76, "放量突破", C.buy, 11, mid) +
        text(cam.x(8.2), 212, "回踩被接住", C.buy, 11, mid) +
        text(cam.x(9.5), 68, "再上", C.buy, 11, mid),
      a,
    );
  }
  if (state.replay && t < 36000) {
    const atSupport = t >= 22000 && t < 30000;
    const label = atSupport
      ? "104 掛買"
      : t >= 19000 && t < 22000
        ? "最新成交"
        : t >= 30000
          ? "本根 Delta"
          : "本根成交量";
    const amount = atSupport
      ? (state.bids?.find((r) => r.price === 104)?.size ?? 0)
      : t >= 19000 && t < 22000
        ? state.price
        : t >= 30000
          ? (current?.delta ?? 0)
          : (current?.volume ?? 0);
    svg +=
      text(180, 73, label, C.muted, 9, end) +
      text(
        180,
        95,
        `${amount}${t >= 19000 && t < 22000 ? " 元" : " 隻"}`,
        atSupport ? C.buy : C.ink,
        17,
        `${end} ${num}`,
      );
    if (atSupport)
      svg += text(500, 61, "賣出增加，低點仍在 104", C.ink, 11, mid);
  }
  const event = state.latestEvent;
  if (state.replay && event?.at >= 7000 && t - event.at < 1500) {
    const action =
      event.kind === "trade"
        ? event.side === "buy"
          ? "主動買入"
          : "主動賣出"
        : event.kind === "cancel"
          ? event.side === "buy"
            ? "撤回掛買"
            : "撤回掛賣"
          : event.side === "buy"
            ? "補入掛買"
            : "新增掛賣";
    svg += text(
      500,
      238,
      `${action} ${event.size} 隻 · ${event.price} 元`,
      event.side === "buy" ? C.buy : C.sell,
      10,
      mid,
    );
  }
  svg +=
    line(68, 271, 905, 271, C.grid, 'stroke-opacity=".45"') +
    text(62, 291, "量", C.muted, 10) +
    text(939, 291, "隻", C.faint, 9, end) +
    line(68, 324, 905, 324, C.grid, 'stroke-opacity=".45"') +
    group(volumes, 1, 'clip-path="url(#retest-volume)"');
  if (t < 13000)
    svg += group(
      line(
        68,
        volumeY(20),
        905,
        volumeY(20),
        C.sell,
        'stroke-opacity=".3" stroke-dasharray="2 5"',
      ),
      1 - show(11000, 2000),
    );
  const points = state.cvdPoints ?? [],
    extent = Math.max(1, ...story.events.map((e) => Math.abs(e.cvd ?? 0))),
    cy = (v) => 369 - (v / extent) * 26;
  let cvd = "";
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1],
      b = points[i];
    cvd += line(
      cam.x(a.x),
      cy(a.cvd),
      cam.x(b.x),
      cy(b.cvd),
      b.cvd >= a.cvd ? C.buy : C.sell,
      'stroke-width="1.8" stroke-linecap="round"',
    );
  }
  const last = points.at(-1);
  if (last)
    cvd += `<circle cx="${cam.x(last.x)}" cy="${cy(last.cvd)}" r="3" fill="${t >= 19000 && t < 30000 ? C.sell : C.buy}"/>`;
  svg += group(
    line(
      68,
      369,
      905,
      369,
      C.grid,
      'stroke-opacity=".3" stroke-dasharray="2 6"',
    ) +
      text(62, 345, "CVD", C.muted, 10) +
      text(
        939,
        345,
        `${state.cvd >= 0 ? "+" : ""}${state.cvd}`,
        t >= 19000 && t < 30000 ? C.sell : C.buy,
        13,
        `${end} ${num} data-cvd-value="${state.cvd}"`,
      ) +
      group(cvd, 1, 'clip-path="url(#retest-cvd)"'),
    cvdAlpha,
  );
  const footer =
    t < 7000
      ? "同一段完整行情：突破 → 回踩 → 再上"
      : t < 13000
        ? "前五根均量 20 · 突破時成交量逐筆累積"
        : t < 19000
          ? "量柱保留突破後的成交；上方仍有人買賣"
          : t < 22000
            ? "回到原壓力 104，接著看賣單去了哪裡"
            : t < 30000
              ? "左側賣出增加、CVD 下滑；104 掛買持續承接"
              : t < 36000
                ? "後續主動買入逐檔成交，價格才再次抬高"
                : "這次被吸收的是賣單：回踩承接 → 買入再推高";
  svg += text(500, 419, footer, t >= 36000 ? C.buy : C.muted, 10, mid);
  return { svg, viewBox: "0 0 1000 430", width: 1000, height: 430 };
}
