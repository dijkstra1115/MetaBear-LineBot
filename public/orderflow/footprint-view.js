import { clamp, ease, TIMING } from "./footprint-model.js";

const C = {
  ink: "#e1ebe7",
  muted: "#88a0a6",
  faint: "#526c73",
  grid: "#30464c",
  buy: "#8bd7c4",
  sell: "#d8b689",
};
const text = (x, y, value, color = C.muted, size = 12, attrs = "") =>
  `<text x="${x}" y="${y}" fill="${color}" font-size="${size}" ${attrs}>${value}</text>`;
const mid = 'text-anchor="middle"',
  number = `${mid} class="number"`;
const rect = (x, y, w, h, fill, attrs = "") =>
  `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}" ${attrs}/>`;
const line = (x1, y1, x2, y2, color, attrs = "") =>
  `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${color}" ${attrs}/>`;
const group = (svg, opacity = 1, attrs = "") =>
  `<g opacity="${clamp(opacity)}" ${attrs}>${svg}</g>`;
export const priceY = (price) => 222 - (price - 101) * 75;
const cellX = (side) => (side === "sell" ? 272 : 568);
const OVERVIEW_SCALE = 0.34;
const COLUMN_GAP = 530;
const RESET_AT = TIMING.reset;

// One world, one camera: opening and closing use exactly the same transform.
// Only the selected completed minute rewinds, explicitly, before its first fill.
export function cameraAt(playhead, reduced = false) {
  const into = reduced
    ? Number(playhead >= TIMING.reset)
    : ease((playhead - TIMING.zoomIn) / (TIMING.reset - TIMING.zoomIn));
  const out = reduced
    ? Number(playhead >= TIMING.panorama)
    : ease((playhead - TIMING.zoomOut) / (TIMING.panorama - TIMING.zoomOut));
  const focus = into * (1 - out);
  return {
    focus,
    scale: OVERVIEW_SCALE + (1 - OVERVIEW_SCALE) * focus,
    preview: playhead < RESET_AT,
  };
}

function columnHead(side, alpha) {
  const x = cellX(side) + 80,
    color = C[side];
  return group(
    text(x, 68, side === "sell" ? "主動賣出" : "主動買入", color, 17, mid) +
      text(x, 88, "成交量 / 隻", C.muted, 10, mid) +
      line(x - 23, 102, x + 23, 102, color, 'stroke-opacity=".42"'),
    alpha,
  );
}

function candle(state, selected, focus) {
  const c = state.candle;
  if (!c)
    return (
      line(500, 136, 500, 307, C.faint, 'stroke-dasharray="2 6"') +
      rect(
        491,
        211,
        18,
        22,
        "none",
        `rx="3" stroke="${C.faint}" stroke-dasharray="3 4"`,
      ) +
      group(
        text(500, 338, "回看這分鐘 · 等待第一筆成交", C.muted, 10, mid),
        focus,
      )
    );
  const color = c.close >= c.open ? C.buy : C.sell;
  const bodyTop = Math.min(priceY(c.open), priceY(c.close));
  const height = Math.max(3, Math.abs(priceY(c.close) - priceY(c.open)));
  return group(
    line(500, priceY(c.high), 500, priceY(c.low), color, 'stroke-width="2"') +
      rect(
        489,
        bodyTop - (height === 3 ? 1.5 : 0),
        22,
        height,
        color,
        'rx="2" fill-opacity=".7"',
      ) +
      line(
        482,
        priceY(c.close),
        518,
        priceY(c.close),
        C.ink,
        'stroke-opacity=".65"',
      ) +
      (selected
        ? group(
            text(
              500,
              338,
              c.closed
                ? "14:30 這一分鐘 · 已收盤"
                : "14:30 這一分鐘 · 成交回看",
              C.muted,
              10,
              mid,
            ),
            focus,
          )
        : ""),
    1,
    `data-candle-close="${c.close}" data-candle-high="${c.high}" data-candle-low="${c.low}"`,
  );
}

function footprintColumn(
  state,
  { selected, focus, playhead, reduced, readFocus, contentAlpha, latest },
) {
  const prices = selected ? [102, 101, 100] : state.rows.map((r) => r.price);
  const age = latest ? playhead - latest.playedAt : Infinity;
  const feedback = reduced ? 0 : 1 - ease(age / 800);
  let svg = "";
  for (const price of prices) {
    const y = priceY(price),
      row = state.rows.find((r) => r.price === price);
    const rowAlpha = 1 - (selected && price !== 101 ? readFocus * 0.62 : 0);
    let cells = "";
    for (const side of ["sell", "buy"]) {
      const x = cellX(side),
        amount = row?.[side] ?? 0,
        color = C[side];
      const active =
        selected && latest?.price === price && latest.side === side;
      const glow = active ? feedback : 0;
      const background = amount
        ? 0.055 + Math.min(amount / 35, 1) * 0.08
        : 0.018;
      let cell = rect(
        x,
        y - 28,
        160,
        56,
        color,
        `rx="9" fill-opacity="${background + glow * 0.12}" stroke="${color}" stroke-opacity="${amount ? 0.28 + glow * 0.6 : 0.1}"`,
      );
      let value =
        amount || state.candle?.closed
          ? text(
              x + 80,
              y + 12,
              amount,
              amount ? color : C.faint,
              35 + 3 * (1 - focus),
              `${number} font-weight="500"`,
            )
          : text(x + 80, y + 5, "·", C.faint, 20, mid);
      cell += group(value, contentAlpha);
      if (active && age >= 0 && age < 1500) {
        const alpha = reduced
          ? Number(age < 1200)
          : 1 - ease((age - 900) / 600);
        cell += group(
          text(
            x + 149,
            y - 9,
            `+${latest.size}`,
            color,
            11,
            'text-anchor="end" class="number"',
          ),
          alpha,
        );
      }
      cells += group(
        cell,
        1,
        `data-${selected ? "footprint" : "context"}-side="${side}" data-price="${price}" data-volume="${amount}"`,
      );
    }
    svg += group(cells, rowAlpha);
  }
  svg += group(candle(state, selected, focus), contentAlpha);
  return svg;
}

export function drawFootprint({ story, state, playhead, reduced }) {
  const motion = (n) => (reduced ? Number(n > 0) : ease(n));
  const { focus, scale, preview } = cameraAt(playhead, reduced);
  const detail = motion((focus - 0.55) / 0.45);
  const overview = 1 - focus;
  const readFocus =
    motion((playhead - TIMING.read) / 500) *
    (1 - motion((playhead - TIMING.zoomOut + 200) / 700));
  const latest = state.trades.at(-1),
    age = latest ? playhead - latest.playedAt : Infinity;
  const selectedState = preview ? story.context[2] : state;
  const contentAlpha = reduced
    ? 1
    : playhead < RESET_AT
      ? 1 - ease((playhead - RESET_AT + 300) / 300)
      : ease((playhead - RESET_AT) / 350);
  let svg =
    text(64, 33, "FOOTPRINT", C.muted, 10, 'letter-spacing="2.8"') +
    text(
      936,
      33,
      focus < 0.5
        ? "5 根 1 分 K · 每根都有成交足跡"
        : preview
          ? "靠近 14:30 · 回看形成過程"
          : "14:30 · 一分鐘的成交紀錄",
      C.muted,
      11,
      'text-anchor="end"',
    );

  // Shared price axis stays aligned with the world during both camera moves.
  for (let price = 98; price <= 104; price++) {
    const y = 222 + (priceY(price) - 222) * scale;
    const alpha = price >= 100 && price <= 102 ? 0.6 : 0.4 * overview;
    if (y < 115 || y > 322) continue;
    svg += group(
      line(
        64 + 180 * focus,
        y,
        946 - 130 * focus,
        y,
        C.grid,
        'stroke-dasharray="2 6"',
      ) + text(965 - 121 * focus, y + 4, price, C.muted, 11, 'class="number"'),
      alpha,
    );
  }
  svg += text(965 - 121 * focus, 106, "元", C.faint, 10);

  let world = "";
  for (let i = 0; i < story.context.length; i++) {
    const context = story.context[i],
      selected = context.selected;
    const barState = selected ? selectedState : context;
    let bar = footprintColumn(barState, {
      selected,
      focus,
      playhead,
      reduced,
      readFocus,
      contentAlpha: selected ? contentAlpha : 1,
      latest: selected && !preview ? latest : null,
    });
    if (selected) {
      // This frame is a locator for the selected minute, not another data layer.
      bar =
        group(
          rect(
            250,
            112,
            500,
            218,
            "#abcbbb",
            'rx="18" fill-opacity=".025" stroke="#9abcaa" stroke-opacity=".55"',
          ),
          overview * motion((playhead - 900) / 450),
        ) + bar;
      bar += group(
        rect(
          251,
          priceY(101) - 34,
          498,
          68,
          "#d4e9df",
          'rx="11" fill-opacity=".025" stroke="#bcd6c8" stroke-opacity=".45"',
        ),
        readFocus,
      );
    }
    world += group(
      bar,
      selected ? 1 : 0.82 * overview,
      `data-footprint-minute="${context.label}" data-selected="${selected}" transform="translate(${(i - 2) * COLUMN_GAP} 0)"`,
    );
  }
  svg += group(
    world,
    1,
    `data-camera-scale="${scale}" data-presentation="${preview ? "overview" : "replay"}" transform="translate(500 222) scale(${scale}) translate(-500 -222)"`,
  );
  for (let i = 0; i < story.context.length; i++) {
    const x = 500 + (i - 2) * COLUMN_GAP * scale;
    svg += group(
      text(
        x,
        343,
        story.context[i].label,
        story.context[i].selected ? C.ink : C.muted,
        12,
        number,
      ),
      overview,
    );
  }
  const markerAlpha = overview * motion((playhead - 900) / 450);
  svg += group(
    text(
      500,
      168,
      playhead < TIMING.zoomOut ? "先看這一根" : "剛才讀懂的這一根",
      C.ink,
      11,
      mid,
    ) + line(500, 175, 500, 183, C.muted, 'stroke-opacity=".5"'),
    markerAlpha,
  );
  svg += columnHead("sell", detail);
  svg += columnHead("buy", detail);
  svg += group(text(500, 77, "K 線", C.muted, 11, mid), detail);

  const incoming = story.trades.find(
    (t) => playhead >= t.playedAt - 500 && playhead < t.playedAt,
  );
  if (incoming && !reduced) {
    const progress = ease((playhead - incoming.playedAt + 500) / 500);
    const x = cellX(incoming.side) + 80,
      y = priceY(incoming.price) - 55 * (1 - progress);
    svg += group(
      rect(
        x - 49,
        y - 14,
        98,
        28,
        "#162b2c",
        `rx="14" stroke="${C[incoming.side]}" stroke-opacity=".6"`,
      ) +
        text(
          x,
          y + 4,
          `${incoming.side === "buy" ? "買進" : "賣出"} ${incoming.size} 隻`,
          C[incoming.side],
          12,
          mid,
        ),
      0.85 * detail,
    );
  }
  if (latest && playhead < TIMING.read) {
    svg += group(
      rect(340, 361, 320, 26, "#1b2a2e", 'rx="13"') +
        text(370, 378, "最近成交", C.muted, 10) +
        text(
          640,
          378,
          `${latest.price} 元 · 主動${latest.side === "buy" ? "買入" : "賣出"} ${latest.size} 隻`,
          C[latest.side],
          11,
          'text-anchor="end"',
        ),
      motion(age / 250),
    );
  }
  return { svg, viewBox: "0 0 1000 400", width: 1000, height: 400 };
}
