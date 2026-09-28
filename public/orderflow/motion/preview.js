// Silent previews of motion lessons for the homepage and the course map:
// the same deterministic draw(ctx, t) the lesson player uses, rendered
// into any canvas at a small size. No audio, no controls.
import { createCompositor, preloadLessonFonts } from "./compositor.js";
import { fontUsage } from "./core.js";

const lessons = new Map();
export function loadLesson(id) {
  if (!lessons.has(id))
    lessons.set(
      id,
      import(`./lessons/${id}.js`).then(async ({ lesson }) => {
        await preloadLessonFonts(lesson, fontUsage, 1);
        return lesson;
      }),
    );
  return lessons.get(id);
}

/** A frame where each lesson reads well as a still (seconds). */
export const POSTER_T = {
  matching: 9.6,
  footprint: 20.5,
  heatmap: 14,
  "order-types": 12.5,
  slippage: 16.5,
  leverage: 13,
  liquidation: 20,
  volume: 13,
  "delta-concept": 21,
  "stop-orders": 13.5,
  "open-interest": 15.5,
  funding: 13.5,
  "volume-profile": 21,
  imbalance: 16,
  wick: 14.8,
  "absorption-story": 29,
  "breakout-volume": 26,
  "order-block": 31,
  "btc-wall": 30.5,
};
export const posterTime = (lesson) => POSTER_T[lesson.id] ?? lesson.duration * 0.5;

/** Live preview bound to one visible canvas. */
export function createPreview(canvas, { width = 960, quality = "high" } = {}) {
  const comp = createCompositor(canvas, { width, quality });
  let raf = 0;
  let run = null;
  const stop = () => {
    cancelAnimationFrame(raf);
    raf = 0;
    run = null;
  };
  return {
    comp,
    resize: (w) => comp.resize(w),
    async show(id, t) {
      const lesson = await loadLesson(id);
      comp.render(lesson, t, Math.round(t * 60), { watermark: false });
      return lesson;
    },
    /** Play [from, to) once or looped; onTick(progress 0..1, t). Resolves when a single pass ends. */
    async play(id, from, to, { loop = false, onTick } = {}) {
      stop();
      const lesson = await loadLesson(id);
      const token = (run = {});
      const t0 = performance.now();
      return new Promise((done) => {
        const step = (now) => {
          if (run !== token) return done(false);
          const span = to - from;
          let e = (now - t0) / 1000;
          if (loop) e %= span;
          const t = Math.min(to, from + e);
          comp.render(lesson, t, Math.round(t * 60), { watermark: false });
          onTick?.((t - from) / span, t);
          if (!loop && t >= to) {
            run = null;
            return done(true);
          }
          raf = requestAnimationFrame(step);
        };
        raf = requestAnimationFrame(step);
      });
    },
    stop,
  };
}

/** One shared renderer that stamps poster frames into many small canvases. */
let stamper = null;
export async function stampPoster(target, id, t) {
  const lesson = await loadLesson(id);
  if (!stamper) {
    const c = document.createElement("canvas");
    stamper = { canvas: c, comp: createCompositor(c, { width: 640, quality: "high" }) };
  }
  const w = Math.min(640, Math.max(320, Math.round(target.clientWidth * Math.min(devicePixelRatio || 1, 2))));
  stamper.comp.resize(w);
  const tt = t ?? posterTime(lesson);
  stamper.comp.render(lesson, tt, Math.round(tt * 60), { watermark: false });
  target.width = stamper.canvas.width;
  target.height = stamper.canvas.height;
  target.getContext("2d").drawImage(stamper.canvas, 0, 0);
  return lesson;
}
