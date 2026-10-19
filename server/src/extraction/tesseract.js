import { config } from '../config.js';
import { toOcrBuffer } from '../lib/image.js';
import { normalizeExtraction } from './schema.js';
import { parseFieldsFromText } from './heuristics.js';

let workerPromise = null;

async function getWorker() {
  if (!workerPromise) {
    workerPromise = (async () => {
      const { createWorker } = await import('tesseract.js');
      const options = {};
      if (config.tesseractLangPath) options.langPath = config.tesseractLangPath;
      return createWorker('eng', 1, options);
    })().catch((error) => {
      workerPromise = null;
      throw error;
    });
  }
  return workerPromise;
}

function collectLines(data) {
  const lines = [];
  for (const block of data.blocks ?? []) {
    for (const paragraph of block.paragraphs ?? []) {
      for (const line of paragraph.lines ?? []) {
        const text = (line.text ?? '').trim();
        if (text.length === 0) continue;
        lines.push({ text, height: (line.bbox?.y1 ?? 0) - (line.bbox?.y0 ?? 0) });
      }
    }
  }
  return lines;
}

function confidenceBand(score) {
  if (score >= 82) return 'high';
  if (score >= 60) return 'medium';
  return 'low';
}

export const tesseractProvider = {
  name: 'tesseract',
  available: true,
  describe() {
    return 'Tesseract OCR (local, no network)';
  },
  async extract(image) {
    const worker = await getWorker();
    const ocrBuffer = await toOcrBuffer(image.buffer);
    const { data } = await worker.recognize(ocrBuffer, {}, { blocks: true, text: true });
    const rawText = data.text ?? '';
    const measuredLines = collectLines(data);
    const confidence = typeof data.confidence === 'number' ? data.confidence : 0;

    const issues = [];
    if (confidence < 70) issues.push('low OCR confidence');
    if (rawText.trim().length < 20) issues.push('very little text recognised');

    const fields = parseFieldsFromText(rawText, measuredLines);

    return {
      extraction: normalizeExtraction({
        ...fields,
        imageQuality: {
          legible: rawText.trim().length >= 20,
          confidence: confidenceBand(confidence),
          issues,
        },
      }),
      usage: { ocrConfidence: Number(confidence.toFixed(1)) },
    };
  },
};

export async function shutdownTesseract() {
  if (!workerPromise) return;
  const worker = await workerPromise.catch(() => null);
  workerPromise = null;
  if (worker) await worker.terminate();
}
