import { VOLUME_UNITS_ML } from './reference.js';

const SMART_CHARACTERS = [
  [/[‘’‚‛′´`]/g, "'"],
  [/[“”„‟″]/g, '"'],
  [/[‐‑‒–—―−]/g, '-'],
  [/[     ]/g, ' '],
  [/…/g, '...'],
];

export function collapseWhitespace(value) {
  if (typeof value !== 'string') return '';
  let out = value;
  for (const [pattern, replacement] of SMART_CHARACTERS) out = out.replace(pattern, replacement);
  return out.replace(/\s+/g, ' ').trim();
}

export function stripAccents(value) {
  return value.normalize('NFKD').replace(/[̀-ͯ]/g, '');
}

export function normalizeLoose(value) {
  return stripAccents(collapseWhitespace(value))
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function tokenize(value) {
  const normalized = normalizeLoose(value);
  return normalized.length === 0 ? [] : normalized.split(' ');
}

export function levenshtein(a, b) {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  const current = new Array(b.length + 1);

  for (let i = 1; i <= a.length; i += 1) {
    current[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const substitution = previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1);
      current[j] = Math.min(current[j - 1] + 1, previous[j] + 1, substitution);
    }
    previous = current.slice();
  }
  return previous[b.length];
}

export function similarity(a, b) {
  const left = normalizeLoose(a);
  const right = normalizeLoose(b);
  if (left.length === 0 && right.length === 0) return 1;
  const longest = Math.max(left.length, right.length);
  if (longest === 0) return 1;
  return 1 - levenshtein(left, right) / longest;
}

const BOTTLER_PREFIX =
  /^\s*(distilled|produced|brewed|vinted|blended|bottled|packed|canned|imported|manufactured|made)\b[\s\w&,]*?\b(by|for)\b\s*/i;

export function stripBottlerPrefix(value) {
  const text = collapseWhitespace(value);
  const stripped = text.replace(BOTTLER_PREFIX, '');
  return stripped.length === 0 ? text : stripped;
}

const COUNTRY_PREFIX = /^\s*(product|produce|produit)\s+of\s+(the\s+)?|^\s*(imported\s+from|made\s+in|grown\s+in)\s+(the\s+)?/i;

export function stripCountryPrefix(value) {
  const text = collapseWhitespace(value);
  const stripped = text.replace(COUNTRY_PREFIX, '');
  return stripped.length === 0 ? text : stripped;
}

export function compareStrings(expected, actual) {
  const expectedTrimmed = collapseWhitespace(expected);
  const actualTrimmed = collapseWhitespace(actual);

  if (expectedTrimmed.length === 0 || actualTrimmed.length === 0) {
    return { kind: 'missing', score: 0 };
  }
  if (expectedTrimmed === actualTrimmed) {
    return { kind: 'exact', score: 1 };
  }
  if (expectedTrimmed.toLowerCase() === actualTrimmed.toLowerCase()) {
    return { kind: 'case', score: 1 };
  }
  if (normalizeLoose(expectedTrimmed) === normalizeLoose(actualTrimmed)) {
    return { kind: 'formatting', score: 1 };
  }

  const score = similarity(expectedTrimmed, actualTrimmed);
  if (score >= 0.86) return { kind: 'near', score };
  return { kind: 'different', score };
}

export function diffWords(expectedWords, actualWords) {
  const rows = expectedWords.length;
  const cols = actualWords.length;
  const table = Array.from({ length: rows + 1 }, () => new Array(cols + 1).fill(0));

  for (let i = rows - 1; i >= 0; i -= 1) {
    for (let j = cols - 1; j >= 0; j -= 1) {
      table[i][j] =
        expectedWords[i] === actualWords[j]
          ? table[i + 1][j + 1] + 1
          : Math.max(table[i + 1][j], table[i][j + 1]);
    }
  }

  const operations = [];
  let i = 0;
  let j = 0;
  while (i < rows && j < cols) {
    if (expectedWords[i] === actualWords[j]) {
      operations.push({ type: 'same', text: actualWords[j] });
      i += 1;
      j += 1;
    } else if (table[i + 1][j] >= table[i][j + 1]) {
      operations.push({ type: 'missing', text: expectedWords[i] });
      i += 1;
    } else {
      operations.push({ type: 'extra', text: actualWords[j] });
      j += 1;
    }
  }
  while (i < rows) {
    operations.push({ type: 'missing', text: expectedWords[i] });
    i += 1;
  }
  while (j < cols) {
    operations.push({ type: 'extra', text: actualWords[j] });
    j += 1;
  }
  return operations;
}

export function parseAlcoholContent(value) {
  const text = collapseWhitespace(value);
  if (text.length === 0) return { abv: null, proof: null, raw: null };

  const percentMatch =
    text.match(/(\d+(?:\.\d+)?)\s*%/) ||
    text.match(/(?:alc(?:ohol)?[^0-9]{0,12})(\d+(?:\.\d+)?)/i) ||
    text.match(/(\d+(?:\.\d+)?)\s*(?:degrees?|deg)\b/i);
  const proofMatch = text.match(/(\d+(?:\.\d+)?)\s*proof/i);

  let abv = percentMatch ? Number.parseFloat(percentMatch[1]) : null;
  const proof = proofMatch ? Number.parseFloat(proofMatch[1]) : null;

  if (abv === null && proof !== null) abv = proof / 2;
  if (abv !== null && !Number.isFinite(abv)) abv = null;

  return { abv, proof, raw: text };
}

export function parseNetContents(value) {
  const text = collapseWhitespace(value);
  if (text.length === 0) return { milliliters: null, amount: null, unit: null, raw: null };

  const match = text.match(
    /(\d+(?:[.,]\d+)?)\s*(ml|milliliters?|millilitres?|cl|centiliters?|centilitres?|dl|l|liters?|litres?|fl\.?\s*oz\.?|fluid\s+ounces?|pints?|quarts?|gallons?)\b/i,
  );
  if (!match) return { milliliters: null, amount: null, unit: null, raw: text };

  const amount = Number.parseFloat(match[1].replace(',', '.'));
  const unitKey = match[2].toLowerCase().replace(/[\s.]/g, '').replace(/s$/, '');
  const factor = VOLUME_UNITS_ML[unitKey] ?? VOLUME_UNITS_ML[`${unitKey}s`];

  if (!Number.isFinite(amount) || factor === undefined) {
    return { milliliters: null, amount: null, unit: null, raw: text };
  }
  return {
    milliliters: Number((amount * factor).toFixed(4)),
    amount,
    unit: match[2].trim(),
    raw: text,
  };
}

export function formatMilliliters(milliliters) {
  if (milliliters === null || milliliters === undefined) return 'unknown';
  if (milliliters >= 1000) {
    return `${Number((milliliters / 1000).toFixed(3))} L`;
  }
  return `${Number(milliliters.toFixed(2))} mL`;
}
