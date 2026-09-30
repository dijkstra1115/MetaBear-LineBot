import { serveLessonAudio } from "../../../../../src/lesson-audio";

// Only narration invokes this small Pages Function. Reuse the bounded Range
// handler so seeking keeps working; all business APIs remain on the Worker.
export const onRequest: PagesFunction<{ ASSETS: Fetcher }> = (context) =>
  serveLessonAudio(context.request, context.env.ASSETS);
