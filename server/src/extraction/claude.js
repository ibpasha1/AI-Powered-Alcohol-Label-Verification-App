import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { config } from '../config.js';
import { claudeExtractionSchema, normalizeExtraction } from './schema.js';

const SYSTEM_PROMPT = `You transcribe text from alcohol beverage label artwork for the TTB label review team.

You are a transcription instrument, not a reviewer. Follow these rules exactly:

1. Report only what is physically printed on the label. Never infer, complete, correct or standardise anything.
2. Transcribe the health warning statement CHARACTER FOR CHARACTER as printed, including any misspelling, omitted word, altered word, wrong punctuation or wrong capitalisation. Do not silently repair it to the familiar wording. A reviewer downstream compares your transcription against the statutory text, so an auto-corrected transcription causes a non-compliant label to be approved.
3. Preserve the original capitalisation of every value you return.
4. Use null for any field that does not appear on the label. Never guess.
5. Never state whether the label passes or fails anything. Compliance decisions are made elsewhere.

Field notes:
- brandName: the brand as displayed, excluding class/type wording.
- classType: the class or type designation, e.g. "Kentucky Straight Bourbon Whiskey", "Merlot", "India Pale Ale".
- alcoholContentText: the full alcohol statement as printed, e.g. "45% ALC./VOL. (90 PROOF)".
- netContentsText: the net contents as printed, e.g. "750 mL".
- bottlerName / bottlerAddress: the "Bottled by", "Produced by", "Distilled by" or "Imported by" party and its city/state.
- governmentWarning.headingText: just the heading as printed, e.g. "GOVERNMENT WARNING:" or "Government Warning:".
- governmentWarning.text: the complete statement including the heading.
- governmentWarning.headingBold: true if the heading is visibly heavier than the surrounding text, false if it is clearly not, null if you cannot tell.
- governmentWarning.separateParagraph: true if the statement stands as its own block of text.
- imageQuality.issues: short phrases such as "glare on lower third", "photographed at an angle", "text cropped at edge". Empty array when the image is clean.`;

let cachedClient = null;

function getClient() {
  if (!cachedClient) {
    cachedClient = new Anthropic({ maxRetries: 1, timeout: config.extractionTimeoutMs });
  }
  return cachedClient;
}

export const claudeProvider = {
  name: 'claude',
  get available() {
    return config.hasAnthropicKey;
  },
  describe() {
    return `Claude vision (${config.anthropicModel})`;
  },
  async extract(image) {
    const response = await getClient().messages.parse({
      model: config.anthropicModel,
      max_tokens: 2048,
      system: SYSTEM_PROMPT,
      thinking: { type: 'between_tools' },
      output_config: {
        effort: 'low',
        format: zodOutputFormat(claudeExtractionSchema, 'label_fields'),
      },
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: image.mediaType,
                data: image.buffer.toString('base64'),
              },
            },
            {
              type: 'text',
              text: 'Transcribe the fields from this alcohol beverage label.',
            },
          ],
        },
      ],
    });

    if (response.stop_reason === 'refusal') {
      throw new Error('The vision model declined to process this image.');
    }
    if (!response.parsed_output) {
      throw new Error('The vision model did not return usable label fields.');
    }

    return {
      extraction: normalizeExtraction(response.parsed_output),
      usage: {
        inputTokens: response.usage?.input_tokens ?? null,
        outputTokens: response.usage?.output_tokens ?? null,
      },
    };
  },
};
