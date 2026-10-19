import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const envFile = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '.env');
if (fs.existsSync(envFile)) {
  process.loadEnvFile(envFile);
}

function integer(name, fallback) {
  const parsed = Number.parseInt(process.env[name] ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

const hasAnthropicKey = Boolean(process.env.ANTHROPIC_API_KEY);
const requestedProvider = (process.env.EXTRACTION_PROVIDER ?? 'auto').toLowerCase();

export const config = {
  port: integer('PORT', 3000),
  provider: requestedProvider === 'auto' ? (hasAnthropicKey ? 'claude' : 'tesseract') : requestedProvider,
  requestedProvider,
  hasAnthropicKey,
  anthropicModel: process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-5-5',
  maxImageEdge: integer('MAX_IMAGE_EDGE', 900),
  extractionTimeoutMs: integer('EXTRACTION_TIMEOUT_MS', 20000),
  batchConcurrency: integer('BATCH_CONCURRENCY', 6),
  maxUploadBytes: integer('MAX_UPLOAD_BYTES', 12 * 1024 * 1024),
  maxBatchFiles: integer('MAX_BATCH_FILES', 60),
  tesseractLangPath: process.env.TESSERACT_LANG_PATH ?? undefined,
};

export const ACCEPTED_IMAGE_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/tiff',
  'image/heic',
  'image/heif',
]);
