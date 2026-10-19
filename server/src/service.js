import { extractFromImage } from './extraction/index.js';
import { verifyLabel } from './rules/engine.js';

export async function verifyLabelImage(application, imageBuffer) {
  const startedAt = Date.now();
  const { extraction, meta } = await extractFromImage(imageBuffer);

  const validationStartedAt = Date.now();
  const result = verifyLabel(application, extraction);
  const validateMs = Date.now() - validationStartedAt;

  return {
    ...result,
    application,
    extraction,
    meta: {
      ...meta,
      timings: { ...meta.timings, validateMs, totalMs: Date.now() - startedAt },
    },
  };
}

export async function mapWithConcurrency(items, limit, worker) {
  const results = new Array(items.length);
  let cursor = 0;

  async function run() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await worker(items[index], index);
    }
  }

  const runners = Array.from({ length: Math.min(limit, items.length) }, run);
  await Promise.all(runners);
  return results;
}
