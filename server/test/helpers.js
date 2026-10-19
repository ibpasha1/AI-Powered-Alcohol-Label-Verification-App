import { GOVERNMENT_WARNING_BODY, GOVERNMENT_WARNING_HEADING } from '../src/rules/reference.js';
import { buildApplication } from '../src/lib/application.js';
import { normalizeExtraction } from '../src/extraction/schema.js';

export const compliantWarning = {
  present: true,
  text: `${GOVERNMENT_WARNING_HEADING} ${GOVERNMENT_WARNING_BODY}`,
  headingText: GOVERNMENT_WARNING_HEADING,
  headingBold: true,
  separateParagraph: true,
};

export function makeApplication(overrides = {}) {
  return buildApplication({
    applicationId: 'TTB-TEST-0001',
    beverageClass: 'distilled_spirits',
    brandName: 'OLD TOM DISTILLERY',
    classType: 'Kentucky Straight Bourbon Whiskey',
    alcoholContentAbv: 45,
    netContents: '750 mL',
    bottlerName: 'DISTILLED AND BOTTLED BY OLD TOM DISTILLERY',
    bottlerAddress: 'BARDSTOWN, KENTUCKY',
    isImported: false,
    countryOfOrigin: '',
    ...overrides,
  });
}

export function makeExtraction(overrides = {}) {
  return normalizeExtraction({
    brandName: 'OLD TOM DISTILLERY',
    classType: 'Kentucky Straight Bourbon Whiskey',
    alcoholContentText: '45% ALC./VOL. (90 PROOF)',
    netContentsText: '750 mL',
    bottlerName: 'DISTILLED AND BOTTLED BY OLD TOM DISTILLERY',
    bottlerAddress: 'BARDSTOWN, KENTUCKY',
    countryOfOrigin: null,
    sulfiteDeclaration: null,
    governmentWarning: { ...compliantWarning },
    rawText: 'OLD TOM DISTILLERY',
    imageQuality: { legible: true, confidence: 'high', issues: [] },
    ...overrides,
  });
}

export function findCheck(result, id) {
  const check = result.checks.find((item) => item.id === id);
  if (!check) throw new Error(`No check with id "${id}"`);
  return check;
}
