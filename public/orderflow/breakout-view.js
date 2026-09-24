import { TIMING, clamp, ease } from "./breakout-model.js";
const C = {
  ink: "#e1ebe7",
  muted: "#8ea8af",
  faint: "#5e7a83",
  grid: "#30464c",
  buy: "#a0dfce",
  sell: "#e0be8d",
};
const text = (x, y, value, color = C.muted, size = 12, attrs = "") =>
  `<text x="${x}" y="${y}" fill="${color}" font-size="${size}" ${attrs}>${value}</text>`;
const rect = (x, y, w, h, color, attrs = "") =>
  `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${color}" ${attrs}/>`;
const line = (x1, y1, x2, y2, color, attrs = "") =>
  `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${color}" ${attrs}/>`;
const group = (svg, opacity = 1, attrs = "") =>
  `<g opacity="${clamp(opacity)}" ${attrs}>${svg}</g>`;
const mid = 'text-anchor="middle"';
export const columnX = (index) => 500 + (index - 4) * 300;
export const priceY = (price) => 222 - (price - 102) * 72;
export const fillX = (index) => 230 + index * 58;
export function cameraAt(playhead, reduced = false) {
  const into = reduced
    ? Number(playhead >= TIMING.focused)
    : ease((playhead - TIMING.zoomIn) / (TIMING.focused - TIMING.zoomIn));
  const out = reduced
    ? Number(playhead >= TIMING.panorama)
    : ease((playhead - TIMING.zoomOut) / (TIMING.panorama - TIMING.zoomOut));
  const focus = into * (1 - out);
  return {
    focus,
    scale: 0.3 + 0.7 * focus,
    x: 500,
    y: 222,
    originX: 500,
    originY: 222,
  };
}
export function comparisonAt(playhead, reduced = false) {
  return reduced
    ? Number(playhead >= TIMING.compared)
    : ease((playhead - TIMING.compare) / (TIMING.compared - TIMING.compare));
}
export function panelCamera(camera, comparison, right = false) {
  return {
    ...camera,
    x: right ? 732 : camera.x - 232 * comparison,
    scale: right ? 0.138 : camera.scale * (1 - 0.54 * comparison),
  };
}
export function projectPoint(x, y, camera) {
  return {
    x: camera.x + (x - camera.originX) * camera.scale,
    y: camera.y + (y - camera.originY) * camera.scale,
  };
}
function candle(bar, target, detail, opacity = 1) {
  const x = columnX(bar.index),
    color = bar.close >= bar.open ? C.buy : C.sell;
  const top = Math.min(priceY(bar.open), priceY(bar.close));
  const height = Math.max(3, Math.abs(priceY(bar.close) - priceY(bar.open)));
  return group(
    line(x, priceY(bar.high), x, priceY(bar.low), color, 'stroke-width="2.8"') +
      rect(
        x - 21,
        top - (height === 3 ? 1.5 : 0),
        42,
        height,
        color,
        'rx="2" fill-opacity=".8"',
      ) +
      (target
        ? group(
            line(
              x - 28,
              priceY(bar.close),
              x + 28,
              priceY(bar.close),
              C.ink,
              'stroke-opacity=".65"',
            ),
            detail,
          )
        : ""),
    opacity,
    `data-candle="${bar.index}" data-open="${bar.open}" data-high="${bar.high}" data-low="${bar.low}" data-close="${bar.close}"`,
  );
}
function historyWorld(bars, targetIndex, focus, detail, selectedAlpha = 1) {
  let world = line(
    columnX(2),
    priceY(102),
    columnX(8) + 90,
    priceY(102),
    C.sell,
    'stroke-opacity=".5" stroke-width="1.4" stroke-dasharray="7 7"',
  );
  for (const bar of bars.filter(Boolean))
    world += candle(
      bar,
      bar.index === targetIndex,
      detail,
      bar.index === targetIndex ? selectedAlpha : 0.85 * (1 - focus),
    );
  return world;
}
export function drawBreakout({ story, state, playhead, reduced = false }) {
  const camera = cameraAt(playhead, reduced),
    { focus } = camera;
  const comparison = comparisonAt(playhead, reduced);
  const comparisonReveal = ease((comparison - 0.88) / 0.12);
  const mainCamera = panelCamera(camera, comparison);
  const secondCamera = panelCamera(camera, comparison, true);
  const show = (at, duration = 450) =>
    reduced ? Number(playhead >= at) : ease((playhead - at) / duration);
  const detail = ease((focus - 0.65) / 0.35),
    macro = ease((0.4 - focus) / 0.4);
  const source = story.markets[state.activeIndex],
    current = state.active;
  const latest = current.latest,
    age = latest ? playhead - latest.at : Infinity;
  const flash = reduced ? 0 : 1 - ease(age / 850);
  const resetAlpha = state.preview
    ? reduced
      ? 1
      : 1 - ease((playhead - TIMING.reset + 220) / 220)
    : show(TIMING.reset, 300) *
      (playhead < TIMING.resetB
        ? reduced
          ? 1
          : 1 - ease((playhead - TIMING.resetB + 220) / 220)
        : show(TIMING.resetB, 350));
  let svg =
    '<defs><clipPath id="breakout-window"><rect x="56" y="85" width="888" height="274" rx="6"/></clipPath></defs>';
  svg += text(64, 32, "BREAKOUT", C.muted, 10, 'letter-spacing="2.7"');
  svg += text(
    936,
    32,
    state.comparing
      ? "同一段歷史 · 兩種深度重演"
      : state.replay
        ? `情境 ${source.id} · 14:30 成交回看`
        : "已完成的模擬行情 · 9 根一分 K",
    C.muted,
    11,
    'text-anchor="end"',
  );

  for (let price = 96; price <= 107; price++) {
    const py = projectPoint(0, priceY(price), mainCamera).y;
    if (py < 102 || py > 345) continue;
    const broad = price === 98 || price === 102 || price === 106;
    const alpha = (broad ? 0.55 : 0.6 * detail) * (1 - comparison);
    svg += group(
      line(
        75,
        py,
        925,
        py,
        C.grid,
        'stroke-opacity=".42" stroke-dasharray="2 7"',
      ) +
        text(
          938,
          py + 4,
          price,
          price === 102 ? C.sell : C.faint,
          10,
          'class="number" data-price-tick="true"',
        ),
      alpha,
    );
  }

  const mainBars = state.comparing
    ? story.markets[0].completedBars
    : state.bars;
  let world = historyWorld(
    mainBars,
    story.targetIndex,
    focus,
    detail,
    resetAlpha,
  );
  const locator = (1 - focus) * (1 - comparison) * show(850);
  world += group(
    rect(
      423,
      130,
      154,
      185,
      C.buy,
      'rx="14" fill-opacity=".025" stroke="#a0dfce" stroke-opacity=".5" stroke-width="3"',
    ),
    locator,
  );

  let execution =
    text(318, 105, "逐筆主動買入", C.buy, 12, mid) +
    text(755, 105, "等待中的掛賣", C.sell, 12, mid);
  let path = `M180 ${priceY(101)}`;
  for (const [index, fill] of current.trades.entries()) {
    const x = fillX(index),
      py = priceY(fill.price);
    path += ` H${x} V${py}`;
    execution += `<circle cx="${x}" cy="${py}" r="${4.2 + Math.sqrt(fill.size) * 0.45}" fill="${C.buy}" data-fill-at="${fill.at}" data-fill-size="${fill.size}"/>`;
    execution += text(
      x,
      py + 25,
      `+${fill.size}`,
      C.buy,
      12,
      `${mid} class="number"`,
    );
  }
  const pathEnd = current.trades.length
    ? fillX(current.trades.length - 1) + 22
    : 197;
  path += ` H${pathEnd}`;
  execution += `<path d="${path}" fill="none" stroke="${C.buy}" stroke-opacity=".35" stroke-width="1.4" data-tick-path="true"/>`;
  for (const price of [102, 103]) {
    const py = priceY(price),
      amount = price === 102 ? current.remaining102 : current.remaining103;
    const initial = price === 102 ? source.depth : 20;
    execution += line(
      530,
      py,
      635,
      py,
      C.grid,
      'stroke-opacity=".5" stroke-dasharray="3 6"',
    );
    execution += rect(650, py - 15, initial * 3.2, 30, "#203036", 'rx="4"');
    execution += rect(
      650,
      py - 15,
      amount * 3.2,
      30,
      C.sell,
      `rx="4" fill-opacity=".52" data-case="${source.id}" data-ask-price="${price}" data-ask-size="${amount}"`,
    );
    execution += text(
      892,
      py + 7,
      amount,
      amount ? C.ink : C.faint,
      20,
      `${mid} class="number"`,
    );
    if (latest?.price === price) {
      execution += group(
        rect(
          648,
          py - 17,
          initial * 3.2 + 4,
          34,
          "none",
          `rx="5" stroke="${C.buy}" stroke-opacity=".7"`,
        ),
        flash,
      );
      if (!reduced && age >= 0 && age < 850) {
        const progress = ease(age / 850);
        execution += `<circle cx="${640 - 106 * progress}" cy="${py}" r="5" fill="${C.buy}" opacity="${1 - progress * 0.6}"/>`;
      }
    }
  }
  execution += text(200, 324, "本段主動買入", C.muted, 11);
  execution += rect(200, 338, 195, 7, C.grid, 'rx="3.5" fill-opacity=".65"');
  execution += rect(
    200,
    338,
    current.volume * 3,
    7,
    C.buy,
    'rx="3.5" fill-opacity=".65"',
  );
  execution += text(
    448,
    348,
    current.volume,
    C.ink,
    28,
    `${mid} class="number" data-active-volume="${current.volume}"`,
  );
  execution += text(481, 347, "隻", C.muted, 11);
  execution += text(755, 325, `102 起初 ${source.depth} 隻`, C.sell, 12, mid);
  execution += text(755, 346, "103 起初 20 隻", C.muted, 11, mid);
  world += group(
    execution,
    detail * resetAlpha * show(TIMING.reset),
    `data-active-case="${source.id}"`,
  );
  const transform = (c) =>
    `translate(${c.x} ${c.y}) scale(${c.scale}) translate(${-c.originX} ${-c.originY})`;
  svg += `<g clip-path="url(#breakout-window)"><g data-main-history="true" data-camera-scale="${mainCamera.scale}" transform="${transform(mainCamera)}">${world}</g>`;
  if (state.comparing)
    svg += group(
      historyWorld(story.markets[1].completedBars, story.targetIndex, 0, 0),
      comparisonReveal,
      `data-comparison-history="true" transform="${transform(secondCamera)}"`,
    );
  svg += "</g>";

  svg += group(
    text(76, 69, `${source.id} · 102 掛賣 ${source.depth} 隻`, C.ink, 12),
    detail * resetAlpha * show(TIMING.reset),
  );
  svg += group(
    text(500, 377, "14:30 · 同一個成交起點 101", C.muted, 11, mid),
    detail,
    'data-footer="detail"',
  );
  svg += group(
    text(
      500,
      409,
      "本段買量不含共同起始 101 × 1 · K 線保留這筆成交",
      C.faint,
      10,
      mid,
    ),
    detail,
    'data-scope="detail"',
  );
  for (const bar of mainBars.filter(Boolean)) {
    const px = projectPoint(columnX(bar.index), 0, mainCamera).x;
    if (px < 70 || px > 930) continue;
    svg += group(
      text(
        px,
        377 - 77 * comparison,
        bar.label,
        bar.index === story.targetIndex ? C.ink : C.muted,
        10,
        mid,
      ),
      macro,
    );
  }
  const target = projectPoint(500, 130, mainCamera);
  svg += group(
    text(
      target.x,
      target.y - 24,
      playhead < TIMING.reset ? "越過 102 的這根 K" : "同樣的突破 K",
      C.ink,
      11,
      mid,
    ) +
      line(
        target.x,
        target.y - 16,
        target.x,
        target.y - 4,
        C.muted,
        'stroke-opacity=".5"',
      ),
    macro * (1 - comparison) * show(850),
  );
  svg += group(
    text(
      500,
      409,
      state.comparing
        ? "本段主動買量 · 不含共同起始成交 1 隻"
        : "同一段已完成歷史 · 先看位置，再看成交",
      C.muted,
      10,
      mid,
    ),
    macro,
    'data-footer="macro"',
  );
  if (state.comparing) {
    for (const [index, panel] of [mainCamera, secondCamera].entries()) {
      const market = story.markets[index],
        result = state.markets[index];
      let comparisonLabels = text(
        panel.x,
        112,
        `${market.id} · 102 掛賣 ${market.depth} 隻`,
        C.muted,
        12,
        mid,
      );
      comparisonLabels += text(panel.x, 333, "本段主動買入", C.muted, 11, mid);
      comparisonLabels += text(
        panel.x,
        371,
        `${result.volume}`,
        C.ink,
        32,
        `${mid} class="number" data-comparison-volume="${market.id}"`,
      );
      comparisonLabels += text(panel.x + 40, 369, "隻", C.muted, 11);
      if (index === 1)
        for (const bar of market.completedBars)
          comparisonLabels += text(
            projectPoint(columnX(bar.index), 0, panel).x,
            300,
            bar.label,
            bar.index === story.targetIndex ? C.ink : C.muted,
            10,
            mid,
          );
      svg += group(
        comparisonLabels,
        comparisonReveal,
        `data-comparison-labels="${market.id}"`,
      );
    }
    svg += group(
      line(500, 112, 500, 372, C.grid, 'stroke-opacity=".45"'),
      comparisonReveal,
    );
  }
  return { svg, viewBox: "0 0 1000 430", width: 1000, height: 430 };
}
