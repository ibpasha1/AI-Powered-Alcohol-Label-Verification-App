import { collapseWhitespace } from '../rules/text.js';

const VOLUME_PATTERN =
  /\d+(?:[.,]\d+)?\s*(?:ml|milliliters?|millilitres?|cl|centiliters?|centilitres?|l|liters?|litres?|fl\.?\s*oz\.?|fluid\s+ounces?|pints?|quarts?)\b/i;
const ALCOHOL_PATTERN = /(\d+(?:\.\d+)?\s*%)|(\d+(?:\.\d+)?\s*proof)|(alc(?:ohol)?\.?\s*(?:\/|by)?\s*vol)/i;
const BOTTLER_PATTERN = /\b(bottled|produced|distilled|brewed|vinted|imported|blended)\s+(?:and\s+\w+\s+)?by\b/i;
const CLASS_PATTERN =
  /\b(whisk(?:e)?y|bourbon|rye|scotch|vodka|gin|rum|tequila|mezcal|brandy|cognac|liqueur|cordial|wine|merlot|chardonnay|cabernet|pinot|riesling|rose|sauvignon|zinfandel|champagne|prosecco|sake|cider|ale|lager|stout|porter|pilsner|beer|malt\s+beverage|india\s+pale\s+ale|ipa)\b/i;
const SULFITE_PATTERN = /contains?\s+(?:naturally\s+occurring\s+)?sulfites?/i;
const COUNTRY_PATTERN = /\bproduct\s+of\s+([A-Za-z .'-]+)|\bimported\s+from\s+([A-Za-z .'-]+)/i;
const ADDRESS_PATTERN = /,\s*[A-Za-z .]{2,}$/;
const BOILERPLATE_PATTERN =
  /^(established|est\.?|since|small\s+batch|cask\s+strength|barrel\s+proof|estate\s+bottled|hand\s*crafted|limited\s+release|reserve|aged\s+\d+|vintage)\b/i;

function classify(text) {
  if (ALCOHOL_PATTERN.test(text)) return 'alcohol';
  if (VOLUME_PATTERN.test(text)) return 'volume';
  if (BOTTLER_PATTERN.test(text)) return 'bottler';
  if (SULFITE_PATTERN.test(text)) return 'sulfite';
  return 'other';
}

function toLines(rawText, measuredLines) {
  if (Array.isArray(measuredLines) && measuredLines.length > 0) {
    return measuredLines
      .map((line) => ({ text: collapseWhitespace(line.text), height: line.height ?? 1 }))
      .filter((line) => line.text.length > 0);
  }
  return rawText
    .split(/\r?\n/)
    .map((text) => ({ text: collapseWhitespace(text), height: 1 }))
    .filter((line) => line.text.length > 0);
}

function groupContiguous(lines) {
  const groups = [];
  let current = null;

  lines.forEach((line, index) => {
    if (line.kind !== 'other') {
      current = null;
      return;
    }
    const similarHeight =
      current !== null && Math.min(line.height, current.height) / Math.max(line.height, current.height) >= 0.75;
    if (current !== null && similarHeight && index === current.lastIndex + 1) {
      current.texts.push(line.text);
      current.height = (current.height + line.height) / 2;
      current.lastIndex = index;
      return;
    }
    current = { texts: [line.text], height: line.height, firstIndex: index, lastIndex: index };
    groups.push(current);
  });

  return groups.map((group) => ({ ...group, text: group.texts.join(' ') }));
}

export function parseFieldsFromText(rawText, measuredLines) {
  const warningIndex = rawText.search(/government\s+warning/i);

  let warningText = null;
  let headingText = null;
  if (warningIndex >= 0) {
    warningText = collapseWhitespace(rawText.slice(warningIndex));
    const headingMatch = rawText.slice(warningIndex).match(/government\s+warning\s*:?/i);
    headingText = headingMatch ? collapseWhitespace(headingMatch[0]) : null;
  }

  const allLines = toLines(rawText, measuredLines).map((line) => ({ ...line, kind: classify(line.text) }));
  const warningStart = allLines.findIndex((line) => /government\s+warning/i.test(line.text));
  const bodyLines = warningStart >= 0 ? allLines.slice(0, warningStart) : allLines;

  const alcoholLine = bodyLines.find((line) => line.kind === 'alcohol')?.text ?? null;
  const volumeLine = bodyLines.find((line) => line.kind === 'volume')?.text ?? null;
  const sulfiteLine = bodyLines.find((line) => line.kind === 'sulfite')?.text ?? null;
  const bottlerIndex = bodyLines.findIndex((line) => line.kind === 'bottler');

  const groups = groupContiguous(bodyLines).filter((group) => group.text.length >= 3);
  const measured = Array.isArray(measuredLines) && measuredLines.length > 0;

  const tallest = (candidates) =>
    candidates.reduce((best, group) => (best === null || group.height > best.height ? group : best), null);

  const classCandidates = groups.filter((group) => CLASS_PATTERN.test(group.text));
  const classGroup = measured ? tallest(classCandidates) : classCandidates[0] ?? null;

  const brandCandidates = groups.filter(
    (group) =>
      group !== classGroup &&
      !CLASS_PATTERN.test(group.text) &&
      !BOILERPLATE_PATTERN.test(group.text) &&
      !ADDRESS_PATTERN.test(group.text),
  );
  const brandGroup = measured ? tallest(brandCandidates) : brandCandidates[0] ?? null;

  const countryMatch = rawText.match(COUNTRY_PATTERN);
  const countryOfOrigin = countryMatch ? collapseWhitespace(countryMatch[1] ?? countryMatch[2]) : null;

  let bottlerName = null;
  let bottlerAddress = null;
  if (bottlerIndex >= 0) {
    bottlerName = bodyLines[bottlerIndex].text;
    const next = bodyLines[bottlerIndex + 1];
    if (next && next.kind === 'other' && ADDRESS_PATTERN.test(next.text)) {
      bottlerAddress = next.text;
    }
  }

  return {
    brandName: brandGroup?.text ?? null,
    classType: classGroup?.text ?? null,
    alcoholContentText: alcoholLine,
    netContentsText: volumeLine,
    bottlerName,
    bottlerAddress,
    countryOfOrigin,
    sulfiteDeclaration: sulfiteLine,
    governmentWarning: {
      present: warningIndex >= 0,
      text: warningText,
      headingText,
      headingBold: null,
      separateParagraph: null,
    },
    rawText,
  };
}
