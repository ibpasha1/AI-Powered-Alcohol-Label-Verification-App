import { describe, expect, it } from 'vitest';
import { verifyLabel } from '../src/rules/engine.js';
import { GOVERNMENT_WARNING_BODY } from '../src/rules/reference.js';
import { compliantWarning, findCheck, makeApplication, makeExtraction } from './helpers.js';

describe('a label that matches the application', () => {
  it('passes with no discrepancies', () => {
    const result = verifyLabel(makeApplication(), makeExtraction());
    expect(result.overallStatus).toBe('pass');
    expect(result.summary.fail).toBe(0);
    expect(result.summary.review).toBe(0);
  });
});

describe('net contents', () => {
  it('fails when the label volume differs from the application', () => {
    const result = verifyLabel(makeApplication(), makeExtraction({ netContentsText: '700 mL' }));
    const check = findCheck(result, 'net_contents');
    expect(check.status).toBe('fail');
    expect(check.message).toContain('700 mL');
    expect(check.message).toContain('750 mL');
    expect(result.overallStatus).toBe('fail');
  });

  it('passes when the same volume is stated in different units', () => {
    const application = makeApplication({ netContents: '1.75 L' });
    const result = verifyLabel(application, makeExtraction({ netContentsText: '1750 mL' }));
    expect(findCheck(result, 'net_contents').status).toBe('pass');
  });

  it('flags a container size that is not an authorised standard of fill', () => {
    const application = makeApplication({ netContents: '680 mL' });
    const result = verifyLabel(application, makeExtraction({ netContentsText: '680 mL' }));
    expect(findCheck(result, 'net_contents').status).toBe('pass');
    expect(findCheck(result, 'standard_of_fill').status).toBe('review');
  });

  it('does not apply standards of fill to malt beverages', () => {
    const application = makeApplication({ beverageClass: 'malt_beverage', netContents: '355 mL', alcoholContentAbv: 5 });
    const result = verifyLabel(application, makeExtraction({ netContentsText: '355 mL', alcoholContentText: '5% ALC./VOL.' }));
    expect(findCheck(result, 'standard_of_fill').status).toBe('not_checked');
  });
});

describe('brand name', () => {
  it('treats a capitalisation-only difference as something for a human to look at, not a failure', () => {
    const application = makeApplication({ brandName: "Stone's Throw" });
    const result = verifyLabel(application, makeExtraction({ brandName: "STONE'S THROW" }));
    const check = findCheck(result, 'brand_name');
    expect(check.status).toBe('review');
    expect(result.overallStatus).toBe('review');
  });

  it('fails on a genuinely different brand', () => {
    const result = verifyLabel(makeApplication(), makeExtraction({ brandName: 'YOUNG JIM DISTILLERY' }));
    expect(findCheck(result, 'brand_name').status).toBe('fail');
  });

  it('flags a single-character difference as a possible typo rather than a mismatch', () => {
    const result = verifyLabel(makeApplication(), makeExtraction({ brandName: 'OLD TOM DISTILLARY' }));
    const check = findCheck(result, 'brand_name');
    expect(check.status).toBe('review');
    expect(check.detail.type).toBe('similarity');
  });
});

describe('alcohol content', () => {
  it('passes on an exact match', () => {
    expect(findCheck(verifyLabel(makeApplication(), makeExtraction()), 'alcohol_content').status).toBe('pass');
  });

  it('flags a difference inside the labelling tolerance for review', () => {
    const result = verifyLabel(makeApplication(), makeExtraction({ alcoholContentText: '45.1% ALC./VOL.' }));
    const check = findCheck(result, 'alcohol_content');
    expect(check.status).toBe('review');
    expect(check.detail.toleranceAbv).toBe(0.15);
  });

  it('fails a difference outside the tolerance', () => {
    const result = verifyLabel(makeApplication(), makeExtraction({ alcoholContentText: '40% ALC./VOL. (80 PROOF)' }));
    expect(findCheck(result, 'alcohol_content').status).toBe('fail');
  });

  it('uses the wider wine tolerance below 14% ABV', () => {
    const application = makeApplication({ beverageClass: 'wine', alcoholContentAbv: 13.5, classType: 'Merlot' });
    const result = verifyLabel(application, makeExtraction({ alcoholContentText: '14.0% ALC./VOL.', classType: 'Merlot' }));
    const check = findCheck(result, 'alcohol_content');
    expect(check.detail.toleranceAbv).toBe(1.5);
    expect(check.status).toBe('review');
  });

  it('catches a label whose proof contradicts its own stated ABV', () => {
    const result = verifyLabel(makeApplication(), makeExtraction({ alcoholContentText: '45% ALC./VOL. (80 PROOF)' }));
    const check = findCheck(result, 'alcohol_content');
    expect(check.status).toBe('fail');
    expect(check.message).toContain('internally inconsistent');
  });
});

describe('health warning statement', () => {
  it('fails when the statement is absent', () => {
    const result = verifyLabel(
      makeApplication(),
      makeExtraction({ governmentWarning: { present: false, text: null, headingText: null, headingBold: null, separateParagraph: null } }),
    );
    expect(findCheck(result, 'government_warning_present').status).toBe('fail');
    expect(result.overallStatus).toBe('fail');
  });

  it('fails when a single word of the mandated text has been changed', () => {
    const altered = GOVERNMENT_WARNING_BODY.replace('may cause health problems', 'can cause health problems');
    const result = verifyLabel(
      makeApplication(),
      makeExtraction({
        governmentWarning: { ...compliantWarning, text: `GOVERNMENT WARNING: ${altered}` },
      }),
    );
    const check = findCheck(result, 'government_warning_text');
    expect(check.status).toBe('fail');
    expect(check.detail.type).toBe('word_diff');
    expect(check.detail.operations.some((operation) => operation.type === 'missing' && operation.text === 'may')).toBe(true);
    expect(check.detail.operations.some((operation) => operation.type === 'extra' && operation.text === 'can')).toBe(true);
  });

  it('fails when a word has been dropped from the mandated text', () => {
    const altered = GOVERNMENT_WARNING_BODY.replace('risk of birth defects', 'risk of birth');
    const result = verifyLabel(
      makeApplication(),
      makeExtraction({ governmentWarning: { ...compliantWarning, text: `GOVERNMENT WARNING: ${altered}` } }),
    );
    expect(findCheck(result, 'government_warning_text').status).toBe('fail');
  });

  it('fails a heading that is in title case instead of capitals', () => {
    const result = verifyLabel(
      makeApplication(),
      makeExtraction({
        governmentWarning: {
          ...compliantWarning,
          text: `Government Warning: ${GOVERNMENT_WARNING_BODY}`,
          headingText: 'Government Warning:',
        },
      }),
    );
    const check = findCheck(result, 'government_warning_format');
    expect(check.status).toBe('fail');
    expect(check.message).toContain('capital letters');
  });

  it('fails a heading that is not in bold type', () => {
    const result = verifyLabel(
      makeApplication(),
      makeExtraction({ governmentWarning: { ...compliantWarning, headingBold: false } }),
    );
    const check = findCheck(result, 'government_warning_format');
    expect(check.status).toBe('fail');
    expect(check.message).toContain('bold');
  });

  it('asks for a human look when bold type cannot be determined from the image', () => {
    const result = verifyLabel(
      makeApplication(),
      makeExtraction({ governmentWarning: { ...compliantWarning, headingBold: null } }),
    );
    expect(findCheck(result, 'government_warning_format').status).toBe('review');
  });

  it('accepts the statement when only punctuation and spacing differ', () => {
    const result = verifyLabel(
      makeApplication(),
      makeExtraction({
        governmentWarning: {
          ...compliantWarning,
          text: `GOVERNMENT WARNING:  (1) According to the Surgeon General, women should not drink alcoholic beverages during pregnancy because of the risk of birth defects.  (2) Consumption of alcoholic beverages impairs your ability to drive a car or operate machinery, and may cause health problems`,
        },
      }),
    );
    expect(findCheck(result, 'government_warning_text').status).toBe('review');
  });
});

describe('bottler statement', () => {
  it('matches when the application omits the responsible-party prefix the label carries', () => {
    const application = makeApplication({ bottlerName: 'OLD TOM DISTILLERY' });
    const result = verifyLabel(application, makeExtraction({ bottlerName: 'DISTILLED AND BOTTLED BY OLD TOM DISTILLERY' }));
    expect(findCheck(result, 'bottler_info').status).toBe('pass');
  });

  it('still fails when the responsible party is a different company', () => {
    const application = makeApplication({ bottlerName: 'OLD TOM DISTILLERY' });
    const result = verifyLabel(application, makeExtraction({ bottlerName: 'BOTTLED BY YOUNG JIM SPIRITS' }));
    expect(findCheck(result, 'bottler_info').status).toBe('fail');
  });

  it('fails when the label carries no bottler statement at all', () => {
    const result = verifyLabel(makeApplication(), makeExtraction({ bottlerName: null, bottlerAddress: null }));
    expect(findCheck(result, 'bottler_info').status).toBe('fail');
  });
});

describe('imported products', () => {
  it('fails an imported product with no country of origin on the label', () => {
    const application = makeApplication({ isImported: true, countryOfOrigin: 'Chile' });
    const result = verifyLabel(application, makeExtraction({ countryOfOrigin: null }));
    expect(findCheck(result, 'country_of_origin').status).toBe('fail');
  });

  it('matches when the label states the country with a "Product of" prefix', () => {
    const application = makeApplication({ isImported: true, countryOfOrigin: 'Chile' });
    const result = verifyLabel(application, makeExtraction({ countryOfOrigin: 'PRODUCT OF CHILE' }));
    expect(findCheck(result, 'country_of_origin').status).toBe('review');
  });

  it('fails when the label names a different country', () => {
    const application = makeApplication({ isImported: true, countryOfOrigin: 'Chile' });
    const result = verifyLabel(application, makeExtraction({ countryOfOrigin: 'PRODUCT OF ARGENTINA' }));
    expect(findCheck(result, 'country_of_origin').status).toBe('fail');
  });

  it('skips the check for a domestic product', () => {
    const result = verifyLabel(makeApplication(), makeExtraction());
    expect(findCheck(result, 'country_of_origin').status).toBe('not_checked');
  });
});

describe('wine specific checks', () => {
  it('asks for confirmation when a wine label carries no sulfite declaration', () => {
    const application = makeApplication({ beverageClass: 'wine', classType: 'Merlot', alcoholContentAbv: 13.5 });
    const result = verifyLabel(
      application,
      makeExtraction({ classType: 'Merlot', alcoholContentText: '13.5% ALC./VOL.', sulfiteDeclaration: null }),
    );
    expect(findCheck(result, 'sulfite_declaration').status).toBe('review');
  });

  it('passes when the declaration is present', () => {
    const application = makeApplication({ beverageClass: 'wine', classType: 'Merlot', alcoholContentAbv: 13.5 });
    const result = verifyLabel(
      application,
      makeExtraction({ classType: 'Merlot', alcoholContentText: '13.5% ALC./VOL.', sulfiteDeclaration: 'CONTAINS SULFITES' }),
    );
    expect(findCheck(result, 'sulfite_declaration').status).toBe('pass');
  });
});

describe('mandatory information', () => {
  it('fails when a mandatory item is missing from the label', () => {
    const result = verifyLabel(makeApplication(), makeExtraction({ netContentsText: null }));
    const check = findCheck(result, 'mandatory_information');
    expect(check.status).toBe('fail');
    expect(check.detail.fields).toContain('Net contents');
  });

  it('does not require an alcohol statement on a malt beverage label', () => {
    const application = makeApplication({ beverageClass: 'malt_beverage', classType: 'India Pale Ale', alcoholContentAbv: null, netContents: '355 mL' });
    const result = verifyLabel(
      application,
      makeExtraction({ classType: 'India Pale Ale', alcoholContentText: null, netContentsText: '355 mL' }),
    );
    expect(findCheck(result, 'mandatory_information').status).toBe('pass');
  });
});

describe('image quality', () => {
  it('fails when the artwork cannot be read', () => {
    const result = verifyLabel(
      makeApplication(),
      makeExtraction({ imageQuality: { legible: false, confidence: 'low', issues: ['heavy glare'] } }),
    );
    const check = findCheck(result, 'image_quality');
    expect(check.status).toBe('fail');
    expect(check.message).toContain('heavy glare');
  });

  it('asks for a human look when the image is readable but imperfect', () => {
    const result = verifyLabel(
      makeApplication(),
      makeExtraction({ imageQuality: { legible: true, confidence: 'medium', issues: ['photographed at an angle'] } }),
    );
    expect(findCheck(result, 'image_quality').status).toBe('review');
  });
});
