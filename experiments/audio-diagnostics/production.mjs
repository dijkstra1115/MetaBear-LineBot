// Promotion adapter: supply index.js verbatim from the active production Worker.
// Keep its routing, security headers, scheduled and queue handlers unchanged.
// Normal builds apply the equivalent audio handler directly in src/index.ts.
import original from './index.js';
import { isLessonAudio, serveLessonAudio } from './lesson-audio.mjs';

export default {
  ...original,
  fetch(request, env, ctx) {
    if (!isLessonAudio(new URL(request.url).pathname))
      return original.fetch(request, env, ctx);
    const assets = env.ASSETS;
    return original.fetch(request, {
      ...env,
      ASSETS: { fetch: assetRequest => serveLessonAudio(assetRequest, assets) },
    }, ctx);
  },
};
