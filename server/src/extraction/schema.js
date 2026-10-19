import { z } from 'zod';

const nullableText = z.string().nullable();

const extractionFields = {
  brandName: nullableText,
  classType: nullableText,
  alcoholContentText: nullableText,
  netContentsText: nullableText,
  bottlerName: nullableText,
  bottlerAddress: nullableText,
  countryOfOrigin: nullableText,
  sulfiteDeclaration: nullableText,
  governmentWarning: z.object({
    present: z.boolean(),
    text: nullableText,
    headingText: nullableText,
    headingBold: z.boolean().nullable(),
    separateParagraph: z.boolean().nullable(),
  }),
  imageQuality: z.object({
    legible: z.boolean(),
    confidence: z.enum(['high', 'medium', 'low']),
    issues: z.array(z.string()),
  }),
};

export const claudeExtractionSchema = z.object(extractionFields);

export const labelExtractionSchema = z.object({ ...extractionFields, rawText: z.string() });

export const emptyExtraction = () => ({
  brandName: null,
  classType: null,
  alcoholContentText: null,
  netContentsText: null,
  bottlerName: null,
  bottlerAddress: null,
  countryOfOrigin: null,
  sulfiteDeclaration: null,
  governmentWarning: {
    present: false,
    text: null,
    headingText: null,
    headingBold: null,
    separateParagraph: null,
  },
  rawText: '',
  imageQuality: { legible: false, confidence: 'low', issues: [] },
});

export function normalizeExtraction(candidate) {
  const base = emptyExtraction();
  const source = candidate ?? {};
  const warning = source.governmentWarning ?? {};
  const quality = source.imageQuality ?? {};

  const text = (value) => {
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    return trimmed.length === 0 ? null : trimmed;
  };

  return {
    ...base,
    brandName: text(source.brandName),
    classType: text(source.classType),
    alcoholContentText: text(source.alcoholContentText),
    netContentsText: text(source.netContentsText),
    bottlerName: text(source.bottlerName),
    bottlerAddress: text(source.bottlerAddress),
    countryOfOrigin: text(source.countryOfOrigin),
    sulfiteDeclaration: text(source.sulfiteDeclaration),
    governmentWarning: {
      present: warning.present === true,
      text: text(warning.text),
      headingText: text(warning.headingText),
      headingBold: typeof warning.headingBold === 'boolean' ? warning.headingBold : null,
      separateParagraph: typeof warning.separateParagraph === 'boolean' ? warning.separateParagraph : null,
    },
    rawText: typeof source.rawText === 'string' ? source.rawText : '',
    imageQuality: {
      legible: quality.legible !== false,
      confidence: ['high', 'medium', 'low'].includes(quality.confidence) ? quality.confidence : 'medium',
      issues: Array.isArray(quality.issues) ? quality.issues.filter((item) => typeof item === 'string') : [],
    },
  };
}
