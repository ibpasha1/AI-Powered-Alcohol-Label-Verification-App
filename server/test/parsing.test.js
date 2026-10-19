import { describe, expect, it } from 'vitest';
import {
  compareStrings,
  stripBottlerPrefix,
  stripCountryPrefix,
  diffWords,
  formatMilliliters,
  parseAlcoholContent,
  parseNetContents,
  tokenize,
} from '../src/rules/text.js';
import { csvToObjects, objectsToCsv, parseCsv } from '../src/lib/csv.js';
import { buildApplication, validateApplication } from '../src/lib/application.js';
import { parseFieldsFromText } from '../src/extraction/heuristics.js';

describe('alcohol content parsing', () => {
  it.each([
    ['45% Alc./Vol. (90 Proof)', 45, 90],
    ['ALC. 13.5% BY VOL.', 13.5, null],
    ['80 PROOF', 40, 80],
    ['5.0% ALC/VOL', 5, null],
  ])('reads %s', (input, abv, proof) => {
    const parsed = parseAlcoholContent(input);
    expect(parsed.abv).toBe(abv);
    expect(parsed.proof).toBe(proof);
  });

  it('returns nothing for text with no alcohol statement', () => {
    expect(parseAlcoholContent('Kentucky Straight Bourbon').abv).toBe(null);
  });
});

describe('net contents parsing', () => {
  it.each([
    ['750 mL', 750],
    ['1.75 L', 1750],
    ['1 LITER', 1000],
    ['50 ml', 50],
    ['12 FL OZ', 354.882],
  ])('converts %s to millilitres', (input, millilitres) => {
    expect(parseNetContents(input).milliliters).toBeCloseTo(millilitres, 2);
  });

  it('handles a comma decimal separator', () => {
    expect(parseNetContents('1,5 L').milliliters).toBe(1500);
  });

  it('returns nothing when no volume is present', () => {
    expect(parseNetContents('Bottled in Kentucky').milliliters).toBe(null);
  });
});

describe('string comparison', () => {
  it('reports an exact match', () => {
    expect(compareStrings('OLD TOM', 'OLD TOM').kind).toBe('exact');
  });

  it('separates a capitalisation difference from a real mismatch', () => {
    expect(compareStrings("Stone's Throw", "STONE'S THROW").kind).toBe('case');
    expect(compareStrings('Old Tom', 'Young Jim').kind).toBe('different');
  });

  it('treats curly and straight apostrophes as the same character', () => {
    expect(compareStrings("Stone's Throw", 'Stone’s Throw').kind).toBe('exact');
  });

  it('detects a near match', () => {
    expect(compareStrings('OLD TOM DISTILLERY', 'OLD TOM DISTILLARY').kind).toBe('near');
  });
});

describe('word diff', () => {
  it('marks words that are missing and words that were added', () => {
    const operations = diffWords(tokenize('may cause health problems'), tokenize('can cause health problems'));
    expect(operations.filter((operation) => operation.type === 'missing').map((operation) => operation.text)).toEqual(['may']);
    expect(operations.filter((operation) => operation.type === 'extra').map((operation) => operation.text)).toEqual(['can']);
  });

  it('reports nothing for identical text', () => {
    const operations = diffWords(tokenize('one two three'), tokenize('one two three'));
    expect(operations.every((operation) => operation.type === 'same')).toBe(true);
  });
});

describe('volume formatting', () => {
  it.each([
    [750, '750 mL'],
    [1750, '1.75 L'],
    [1000, '1 L'],
  ])('formats %s', (millilitres, expected) => {
    expect(formatMilliliters(millilitres)).toBe(expected);
  });
});

describe('csv handling', () => {
  it('parses quoted fields containing commas and escaped quotes', () => {
    const rows = parseCsv('a,b\n"x,1","he said ""hi"""\n');
    expect(rows[1]).toEqual(['x,1', 'he said "hi"']);
  });

  it('maps rows onto headers', () => {
    const records = csvToObjects('file,brandName\nlabel.jpg,OLD TOM\n');
    expect(records).toEqual([{ file: 'label.jpg', brandName: 'OLD TOM' }]);
  });

  it('round-trips values that need quoting', () => {
    const csv = objectsToCsv([{ key: 'note' }], [{ note: 'one, two' }]);
    expect(csvToObjects(csv)).toEqual([{ note: 'one, two' }]);
  });
});

describe('application input', () => {
  it('normalises a beverage class written in free text', () => {
    expect(buildApplication({ beverageClass: 'Malt Beverage' }).beverageClass).toBe('malt_beverage');
  });

  it('strips a percent sign from the alcohol figure', () => {
    expect(buildApplication({ alcoholContentAbv: '45%' }).alcoholContentAbv).toBe(45);
  });

  it('reads yes and no for the imported flag', () => {
    expect(buildApplication({ isImported: 'yes' }).isImported).toBe(true);
    expect(buildApplication({ isImported: 'no' }).isImported).toBe(false);
  });

  it('requires a country of origin when the product is imported', () => {
    const errors = validateApplication(buildApplication({ brandName: 'X', netContents: '750 mL', alcoholContentAbv: 40, isImported: 'yes' }));
    expect(errors.map((error) => error.field)).toContain('countryOfOrigin');
  });

  it('does not require an alcohol figure for a malt beverage', () => {
    const errors = validateApplication(buildApplication({ brandName: 'X', netContents: '355 mL', beverageClass: 'malt_beverage' }));
    expect(errors).toEqual([]);
  });
});

describe('ocr text heuristics', () => {
  const ocrText = [
    'OLD TOM DISTILLERY',
    'Kentucky Straight Bourbon Whiskey',
    '45% ALC./VOL. (90 PROOF)',
    '750 mL',
    'DISTILLED AND BOTTLED BY OLD TOM DISTILLERY',
    'BARDSTOWN, KENTUCKY',
    'GOVERNMENT WARNING: (1) According to the Surgeon General...',
  ].join('\n');

  it('pulls the alcohol, volume and warning out of raw OCR text', () => {
    const fields = parseFieldsFromText(ocrText);
    expect(fields.alcoholContentText).toBe('45% ALC./VOL. (90 PROOF)');
    expect(fields.netContentsText).toBe('750 mL');
    expect(fields.governmentWarning.present).toBe(true);
    expect(fields.governmentWarning.headingText).toBe('GOVERNMENT WARNING:');
    expect(fields.bottlerName).toContain('BOTTLED BY');
    expect(fields.bottlerAddress).toBe('BARDSTOWN, KENTUCKY');
  });

  it('reports no warning when the text does not contain one', () => {
    expect(parseFieldsFromText('OLD TOM DISTILLERY\n750 mL').governmentWarning.present).toBe(false);
  });
});

describe('bottler prefix handling', () => {
  it.each([
    ['DISTILLED AND BOTTLED BY OLD TOM DISTILLERY', 'OLD TOM DISTILLERY'],
    ['Bottled by Stone\u2019s Throw Distilling', "Stone's Throw Distilling"],
    ['IMPORTED BY CEDAR RIDGE IMPORTS', 'CEDAR RIDGE IMPORTS'],
    ['Produced and bottled by Harbor Light Spirits Co.', 'Harbor Light Spirits Co.'],
  ])('strips the responsible-party prefix from %s', (input, expected) => {
    expect(stripBottlerPrefix(input)).toBe(expected);
  });

  it('leaves a bare company name untouched', () => {
    expect(stripBottlerPrefix('OLD TOM DISTILLERY')).toBe('OLD TOM DISTILLERY');
  });

  it('does not strip a name down to nothing', () => {
    expect(stripBottlerPrefix('Bottled by')).toBe('Bottled by');
  });
});

describe('country of origin prefix handling', () => {
  it.each([
    ['PRODUCT OF CHILE', 'CHILE'],
    ['Product of the United Kingdom', 'United Kingdom'],
    ['IMPORTED FROM FRANCE', 'FRANCE'],
    ['Made in Mexico', 'Mexico'],
    ['Chile', 'Chile'],
  ])('reduces %s to the country', (input, expected) => {
    expect(stripCountryPrefix(input)).toBe(expected);
  });
});
