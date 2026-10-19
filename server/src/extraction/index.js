import { config } from '../config.js';
import { claudeProvider } from './claude.js';
import { tesseractProvider } from './tesseract.js';
import { prepareImage } from '../lib/image.js';

const providers = {
  claude: claudeProvider,
  tesseract: tesseractProvider,
};

export function activeProvider() {
  const selected = providers[config.provider];
  if (!selected) {
    throw new Error(`Unknown extraction provider "${config.provider}". Use "claude", "tesseract" or "auto".`);
  }
  if (selected.name === 'claude' && !selected.available) {
    throw new Error('EXTRACTION_PROVIDER is set to "claude" but ANTHROPIC_API_KEY is not configured.');
  }
  return selected;
}

export function providerStatus() {
  const selected = providers[config.provider];
  return {
    name: config.provider,
    label: selected ? selected.describe() : 'unknown',
    requested: config.requestedProvider,
    ready: Boolean(selected && selected.available),
    model: config.provider === 'claude' ? config.anthropicModel : null,
  };
}

export async function extractFromImage(buffer) {
  const provider = activeProvider();
  const preparedAt = Date.now();
  const image = await prepareImage(buffer);
  const prepareMs = Date.now() - preparedAt;

  const extractedAt = Date.now();
  const { extraction, usage } = await provider.extract(image);
  const extractMs = Date.now() - extractedAt;

  return {
    extraction,
    meta: {
      provider: provider.name,
      providerLabel: provider.describe(),
      usage: usage ?? null,
      image: {
        width: image.width,
        height: image.height,
        originalWidth: image.originalWidth,
        originalHeight: image.originalHeight,
        originalBytes: image.originalBytes,
        preparedBytes: image.preparedBytes,
      },
      timings: { prepareMs, extractMs },
    },
  };
}
