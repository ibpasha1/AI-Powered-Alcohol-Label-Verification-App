import {
  ABV_TOLERANCE,
  BEVERAGE_CLASS_LABELS,
  FIELD_LABELS,
  GOVERNMENT_WARNING_BODY,
  GOVERNMENT_WARNING_HEADING,
  REQUIRED_FIELDS,
  STANDARDS_OF_FILL_ML,
} from './reference.js';
import {
  collapseWhitespace,
  compareStrings,
  diffWords,
  formatMilliliters,
  normalizeLoose,
  parseAlcoholContent,
  parseNetContents,
  stripBottlerPrefix,
  stripCountryPrefix,
  tokenize,
} from './text.js';

const PASS = 'pass';
const REVIEW = 'review';
const FAIL = 'fail';
const SKIPPED = 'not_checked';

const MATCH_MESSAGES = {
  exact: 'Label matches the application exactly.',
  case: 'Same wording, but the capitalisation differs from the application.',
  formatting: 'Same wording, but punctuation or spacing differs from the application.',
  near: 'Very close to the application — check for a typo in one of the two.',
  different: 'Label does not match the application.',
  missing: 'Not found on the label.',
};

function check(fields) {
  return {
    status: SKIPPED,
    applicationValue: null,
    labelValue: null,
    message: '',
    detail: null,
    ...fields,
  };
}

function textMatchStatus(kind) {
  if (kind === 'exact') return PASS;
  if (kind === 'missing' || kind === 'different') return FAIL;
  return REVIEW;
}

function checkBrandName(application, extraction) {
  const expected = collapseWhitespace(application.brandName);
  const found = collapseWhitespace(extraction.brandName);
  const base = {
    id: 'brand_name',
    title: 'Brand name',
    citation: '27 CFR 5.63(a)(1)',
    applicationValue: expected || null,
    labelValue: found || null,
  };

  if (!expected) {
    return check({ ...base, status: SKIPPED, message: 'No brand name was entered on the application.' });
  }

  const result = compareStrings(expected, found);
  return check({
    ...base,
    status: textMatchStatus(result.kind),
    message: MATCH_MESSAGES[result.kind],
    detail: result.kind === 'near' ? { type: 'similarity', score: Number(result.score.toFixed(3)) } : null,
  });
}

function checkClassType(application, extraction) {
  const expected = collapseWhitespace(application.classType);
  const found = collapseWhitespace(extraction.classType);
  const base = {
    id: 'class_type',
    title: 'Class / type designation',
    citation: '27 CFR 5.63(a)(2)',
    applicationValue: expected || null,
    labelValue: found || null,
  };

  if (!expected) {
    return check({ ...base, status: SKIPPED, message: 'No class or type was entered on the application.' });
  }
  if (!found) {
    return check({ ...base, status: FAIL, message: MATCH_MESSAGES.missing });
  }

  const result = compareStrings(expected, found);
  if (result.kind === 'different') {
    const expectedTokens = tokenize(expected);
    const foundNormalized = normalizeLoose(found);
    const covered = expectedTokens.filter((token) => foundNormalized.includes(token));
    if (expectedTokens.length > 0 && covered.length === expectedTokens.length) {
      return check({
        ...base,
        status: REVIEW,
        message: 'Label carries the designation from the application plus extra wording.',
      });
    }
    const missing = expectedTokens.filter((token) => !foundNormalized.includes(token));
    return check({
      ...base,
      status: FAIL,
      message: MATCH_MESSAGES.different,
      detail: missing.length > 0 ? { type: 'missing_words', words: missing } : null,
    });
  }

  return check({ ...base, status: textMatchStatus(result.kind), message: MATCH_MESSAGES[result.kind] });
}

function checkAlcoholContent(application, extraction) {
  const beverageClass = application.beverageClass;
  const tolerance = ABV_TOLERANCE[beverageClass] ?? ABV_TOLERANCE.distilled_spirits;
  const parsed = parseAlcoholContent(extraction.alcoholContentText);
  const expected =
    application.alcoholContentAbv === null || application.alcoholContentAbv === undefined
      ? null
      : Number(application.alcoholContentAbv);

  const base = {
    id: 'alcohol_content',
    title: 'Alcohol content',
    citation: tolerance.citation,
    applicationValue: expected === null ? null : `${expected}% Alc./Vol.`,
    labelValue: parsed.raw,
  };

  const required = REQUIRED_FIELDS[beverageClass]?.fields.includes('alcoholContent');

  if (expected === null || !Number.isFinite(expected)) {
    return check({ ...base, status: SKIPPED, message: 'No alcohol content was entered on the application.' });
  }
  if (parsed.abv === null) {
    return check({
      ...base,
      status: required ? FAIL : REVIEW,
      message: required
        ? 'No alcohol content statement was found on the label.'
        : 'No alcohol content statement found. Optional for this beverage class, but verify state requirements.',
    });
  }

  const allowed = tolerance.tolerance(expected);
  const difference = Math.abs(parsed.abv - expected);
  const detail = {
    type: 'alcohol',
    applicationAbv: expected,
    labelAbv: parsed.abv,
    labelProof: parsed.proof,
    difference: Number(difference.toFixed(3)),
    toleranceAbv: allowed,
  };

  if (parsed.proof !== null && Math.abs(parsed.proof - parsed.abv * 2) > 0.2) {
    return check({
      ...base,
      status: FAIL,
      message: `Label is internally inconsistent: ${parsed.abv}% ABV should be ${Number((parsed.abv * 2).toFixed(2))} proof, not ${parsed.proof} proof.`,
      detail,
    });
  }
  if (difference === 0) {
    return check({ ...base, status: PASS, message: 'Alcohol content matches the application.', detail });
  }
  if (difference <= allowed) {
    return check({
      ...base,
      status: REVIEW,
      message: `Label states ${parsed.abv}% but the application says ${expected}%. Within the ${allowed}% labelling tolerance — confirm which figure is correct.`,
      detail,
    });
  }
  return check({
    ...base,
    status: FAIL,
    message: `Label states ${parsed.abv}% but the application says ${expected}%. That exceeds the ${allowed}% tolerance.`,
    detail,
  });
}

function checkNetContents(application, extraction) {
  const beverageClass = application.beverageClass;
  const expected = parseNetContents(application.netContents);
  const found = parseNetContents(extraction.netContentsText);
  const base = {
    id: 'net_contents',
    title: 'Net contents',
    citation: '27 CFR 5.63(a)(4)',
    applicationValue: expected.raw,
    labelValue: found.raw,
  };

  if (expected.milliliters === null) {
    return check({
      ...base,
      status: SKIPPED,
      message: 'No usable net contents value was entered on the application.',
    });
  }
  if (found.milliliters === null) {
    return check({ ...base, status: FAIL, message: 'No net contents statement was found on the label.' });
  }

  const detail = {
    type: 'volume',
    applicationMl: expected.milliliters,
    labelMl: found.milliliters,
  };

  if (Math.abs(expected.milliliters - found.milliliters) > 0.5) {
    return check({
      ...base,
      status: FAIL,
      message: `Label states ${formatMilliliters(found.milliliters)} but the application says ${formatMilliliters(expected.milliliters)}.`,
      detail,
    });
  }

  const sameWording = collapseWhitespace(expected.raw).toLowerCase() === collapseWhitespace(found.raw).toLowerCase();
  return check({
    ...base,
    status: PASS,
    message: sameWording
      ? 'Net contents match the application.'
      : `Net contents match the application (${formatMilliliters(found.milliliters)}), stated in different units.`,
    detail,
  });
}

function checkStandardOfFill(application, extraction) {
  const beverageClass = application.beverageClass;
  const standard = STANDARDS_OF_FILL_ML[beverageClass];
  const found = parseNetContents(extraction.netContentsText);
  const expected = parseNetContents(application.netContents);
  const volume = found.milliliters ?? expected.milliliters;

  const base = {
    id: 'standard_of_fill',
    title: 'Standard of fill',
    citation: standard?.citation ?? '27 CFR 5.203',
    applicationValue: expected.milliliters === null ? null : formatMilliliters(expected.milliliters),
    labelValue: found.milliliters === null ? null : formatMilliliters(found.milliliters),
  };

  if (!standard || standard.sizes === null) {
    return check({
      ...base,
      status: SKIPPED,
      message: `No standards of fill apply to ${(BEVERAGE_CLASS_LABELS[beverageClass] ?? 'this class').toLowerCase()}.`,
    });
  }
  if (volume === null) {
    return check({ ...base, status: SKIPPED, message: 'No net contents value available to check.' });
  }
  if (standard.sizes.some((size) => Math.abs(size - volume) <= 0.5)) {
    return check({
      ...base,
      status: PASS,
      message: `${formatMilliliters(volume)} is an authorised container size.`,
    });
  }
  return check({
    ...base,
    status: REVIEW,
    message: `${formatMilliliters(volume)} is not on the list of authorised container sizes. Confirm against ${standard.citation}.`,
    detail: { type: 'standard_of_fill', volumeMl: volume, authorised: standard.sizes },
  });
}

function checkBottler(application, extraction) {
  const expectedName = collapseWhitespace(application.bottlerName);
  const expectedAddress = collapseWhitespace(application.bottlerAddress);
  const foundName = collapseWhitespace(extraction.bottlerName);
  const foundAddress = collapseWhitespace(extraction.bottlerAddress);

  const base = {
    id: 'bottler_info',
    title: 'Name and address of bottler / producer',
    citation: '27 CFR 5.66',
    applicationValue: [expectedName, expectedAddress].filter(Boolean).join(' — ') || null,
    labelValue: [foundName, foundAddress].filter(Boolean).join(' — ') || null,
  };

  if (!foundName && !foundAddress) {
    return check({ ...base, status: FAIL, message: 'No bottler or producer statement was found on the label.' });
  }
  if (!expectedName && !expectedAddress) {
    return check({
      ...base,
      status: REVIEW,
      message: 'Label carries a bottler statement but the application left this blank — nothing to compare against.',
    });
  }

  const nameResult = expectedName
    ? compareStrings(stripBottlerPrefix(expectedName), stripBottlerPrefix(foundName))
    : { kind: 'exact' };
  const addressResult = expectedAddress ? compareStrings(expectedAddress, foundAddress) : { kind: 'exact' };
  const worst = [nameResult.kind, addressResult.kind].reduce((acc, kind) => {
    const order = { exact: 0, case: 1, formatting: 1, near: 2, different: 3, missing: 3 };
    return order[kind] > order[acc] ? kind : acc;
  }, 'exact');

  if (worst === 'exact') {
    return check({ ...base, status: PASS, message: 'Bottler name and address match the application.' });
  }
  if (worst === 'different' || worst === 'missing') {
    const which = nameResult.kind === worst ? 'name' : 'address';
    return check({ ...base, status: FAIL, message: `Bottler ${which} on the label does not match the application.` });
  }
  return check({ ...base, status: REVIEW, message: 'Bottler details differ in wording or formatting from the application.' });
}

function checkCountryOfOrigin(application, extraction) {
  const expected = collapseWhitespace(application.countryOfOrigin);
  const found = collapseWhitespace(extraction.countryOfOrigin);
  const base = {
    id: 'country_of_origin',
    title: 'Country of origin',
    citation: '19 CFR 134 / 27 CFR 5.69',
    applicationValue: expected || null,
    labelValue: found || null,
  };

  if (!application.isImported) {
    return check({ ...base, status: SKIPPED, message: 'Application is not marked as an imported product.' });
  }
  if (!found) {
    return check({ ...base, status: FAIL, message: 'Imported product, but no country of origin was found on the label.' });
  }
  if (!expected) {
    return check({
      ...base,
      status: REVIEW,
      message: 'Label states a country of origin but the application left the field blank.',
    });
  }

  const result = compareStrings(stripCountryPrefix(expected), stripCountryPrefix(found));
  return check({ ...base, status: textMatchStatus(result.kind), message: MATCH_MESSAGES[result.kind] });
}

function extractWarningHeading(rawText) {
  const match = rawText.match(/government\s+warning\s*:?/i);
  return match ? match[0] : null;
}

function checkWarningPresent(extraction) {
  const warning = extraction.governmentWarning ?? {};
  const text = collapseWhitespace(warning.text);
  const base = {
    id: 'government_warning_present',
    title: 'Health warning statement present',
    citation: '27 CFR 16.21',
    applicationValue: 'Required on every container',
    labelValue: text ? `${text.slice(0, 80)}${text.length > 80 ? '…' : ''}` : null,
  };

  if (warning.present === true && text.length > 0) {
    return check({ ...base, status: PASS, message: 'Health warning statement found on the label.' });
  }
  if (warning.present === true) {
    return check({
      ...base,
      status: REVIEW,
      message: 'A warning statement was detected but no text could be read from it.',
    });
  }
  return check({
    ...base,
    status: FAIL,
    message: 'No health warning statement was found. This is mandatory on all alcohol beverage containers.',
  });
}

function checkWarningText(extraction) {
  const warning = extraction.governmentWarning ?? {};
  const text = collapseWhitespace(warning.text);
  const base = {
    id: 'government_warning_text',
    title: 'Health warning wording',
    citation: '27 CFR 16.21',
    applicationValue: GOVERNMENT_WARNING_BODY,
    labelValue: text || null,
  };

  if (!text) {
    return check({ ...base, status: SKIPPED, message: 'No warning text available to compare.' });
  }

  const heading = collapseWhitespace(warning.headingText) || extractWarningHeading(text) || '';
  const headingIndex = heading ? text.toLowerCase().indexOf(heading.toLowerCase()) : -1;
  const body = headingIndex >= 0 ? text.slice(headingIndex + heading.length) : text;

  const expectedWords = tokenize(GOVERNMENT_WARNING_BODY);
  const actualWords = tokenize(body);
  const operations = diffWords(expectedWords, actualWords);
  const differences = operations.filter((operation) => operation.type !== 'same');
  const detail = { type: 'word_diff', operations };

  if (differences.length > 0) {
    const missing = differences.filter((operation) => operation.type === 'missing').length;
    const extra = differences.filter((operation) => operation.type === 'extra').length;
    return check({
      ...base,
      status: FAIL,
      message: `Warning wording is not the mandated text — ${missing} word(s) missing, ${extra} word(s) added. The statement must appear verbatim.`,
      detail,
    });
  }

  const expectedBody = `${GOVERNMENT_WARNING_BODY}`;
  if (collapseWhitespace(body) !== expectedBody) {
    return check({
      ...base,
      status: REVIEW,
      message: 'Wording is correct word-for-word, but punctuation, spacing or capitalisation differs from the mandated text.',
      detail,
    });
  }
  return check({ ...base, status: PASS, message: 'Warning wording matches the mandated text exactly.', detail });
}

function checkWarningFormat(extraction) {
  const warning = extraction.governmentWarning ?? {};
  const text = collapseWhitespace(warning.text);
  const heading = collapseWhitespace(warning.headingText) || extractWarningHeading(text) || '';
  const base = {
    id: 'government_warning_format',
    title: 'Health warning formatting',
    citation: '27 CFR 16.22',
    applicationValue: `"${GOVERNMENT_WARNING_HEADING}" in capital letters and bold type`,
    labelValue: heading || null,
  };

  if (!text) {
    return check({ ...base, status: SKIPPED, message: 'No warning text available to check.' });
  }
  if (!heading) {
    return check({
      ...base,
      status: FAIL,
      message: 'The words "GOVERNMENT WARNING:" do not appear at the start of the statement.',
    });
  }

  const problems = [];
  const headingWords = heading.replace(/[:\s]+$/, '');
  if (headingWords !== headingWords.toUpperCase()) {
    problems.push(`"${headingWords}" is not in capital letters`);
  }
  if (warning.headingBold === false) {
    problems.push('the heading does not appear to be in bold type');
  }
  if (problems.length > 0) {
    return check({
      ...base,
      status: FAIL,
      message: `Heading formatting is non-compliant: ${problems.join(' and ')}.`,
      detail: { type: 'format', headingBold: warning.headingBold ?? null },
    });
  }

  const notes = [];
  if (warning.headingBold === null || warning.headingBold === undefined) {
    notes.push('bold type could not be confirmed from the image');
  }
  if (warning.separateParagraph === false) {
    notes.push('the statement does not appear as a separate paragraph');
  }
  if (notes.length > 0) {
    return check({
      ...base,
      status: REVIEW,
      message: `Heading is in capital letters, but ${notes.join(' and ')}. Confirm by eye.`,
      detail: { type: 'format', headingBold: warning.headingBold ?? null },
    });
  }
  return check({
    ...base,
    status: PASS,
    message: 'Heading is in capital letters and bold type, set as a separate paragraph.',
  });
}

function checkSulfiteDeclaration(application, extraction) {
  const base = {
    id: 'sulfite_declaration',
    title: 'Sulfite declaration',
    citation: '27 CFR 4.32(e)',
    applicationValue: 'Required when sulfur dioxide is 10 ppm or more',
    labelValue: collapseWhitespace(extraction.sulfiteDeclaration) || null,
  };

  if (application.beverageClass !== 'wine') {
    return check({ ...base, status: SKIPPED, message: 'Only applies to wine.' });
  }
  if (base.labelValue) {
    return check({ ...base, status: PASS, message: 'Sulfite declaration found on the label.' });
  }
  return check({
    ...base,
    status: REVIEW,
    message: 'No sulfite declaration found. Required if the wine contains 10 ppm or more of sulfur dioxide — confirm the lab analysis.',
  });
}

function checkImageQuality(extraction) {
  const quality = extraction.imageQuality ?? {};
  const issues = Array.isArray(quality.issues) ? quality.issues.filter(Boolean) : [];
  const base = {
    id: 'image_quality',
    title: 'Image legibility',
    citation: null,
    applicationValue: 'Label artwork must be fully legible',
    labelValue: quality.confidence ? `${quality.confidence} confidence` : null,
  };

  if (quality.legible === false) {
    return check({
      ...base,
      status: FAIL,
      message: `The label image could not be read reliably${issues.length > 0 ? `: ${issues.join(', ')}` : ''}. Request clearer artwork.`,
      detail: issues.length > 0 ? { type: 'issues', issues } : null,
    });
  }
  if (quality.confidence === 'low' || issues.length > 0) {
    return check({
      ...base,
      status: REVIEW,
      message: `Image is readable but imperfect${issues.length > 0 ? `: ${issues.join(', ')}` : ''}. Verify the flagged fields by eye.`,
      detail: issues.length > 0 ? { type: 'issues', issues } : null,
    });
  }
  return check({ ...base, status: PASS, message: 'Label image is clear and fully legible.' });
}

function checkRequiredFields(application, extraction) {
  const beverageClass = application.beverageClass;
  const spec = REQUIRED_FIELDS[beverageClass] ?? REQUIRED_FIELDS.distilled_spirits;
  const presence = {
    brandName: Boolean(collapseWhitespace(extraction.brandName)),
    classType: Boolean(collapseWhitespace(extraction.classType)),
    alcoholContent: parseAlcoholContent(extraction.alcoholContentText).abv !== null,
    netContents: parseNetContents(extraction.netContentsText).milliliters !== null,
    bottler: Boolean(collapseWhitespace(extraction.bottlerName) || collapseWhitespace(extraction.bottlerAddress)),
  };
  const missing = spec.fields.filter((field) => !presence[field]);

  const base = {
    id: 'mandatory_information',
    title: 'Mandatory label information',
    citation: spec.citation,
    applicationValue: spec.fields.map((field) => FIELD_LABELS[field]).join(', '),
    labelValue: spec.fields.filter((field) => presence[field]).map((field) => FIELD_LABELS[field]).join(', ') || null,
  };

  if (missing.length === 0) {
    return check({
      ...base,
      status: PASS,
      message: `All mandatory items for ${(BEVERAGE_CLASS_LABELS[beverageClass] ?? 'this class').toLowerCase()} were found on the label.`,
    });
  }
  return check({
    ...base,
    status: FAIL,
    message: `Missing from the label: ${missing.map((field) => FIELD_LABELS[field]).join(', ')}.`,
    detail: { type: 'missing_fields', fields: missing.map((field) => FIELD_LABELS[field]) },
  });
}

export function verifyLabel(application, extraction) {
  const checks = [
    checkRequiredFields(application, extraction),
    checkBrandName(application, extraction),
    checkClassType(application, extraction),
    checkAlcoholContent(application, extraction),
    checkNetContents(application, extraction),
    checkStandardOfFill(application, extraction),
    checkBottler(application, extraction),
    checkCountryOfOrigin(application, extraction),
    checkWarningPresent(extraction),
    checkWarningText(extraction),
    checkWarningFormat(extraction),
    checkSulfiteDeclaration(application, extraction),
    checkImageQuality(extraction),
  ];

  const summary = {
    pass: checks.filter((item) => item.status === PASS).length,
    review: checks.filter((item) => item.status === REVIEW).length,
    fail: checks.filter((item) => item.status === FAIL).length,
    notChecked: checks.filter((item) => item.status === SKIPPED).length,
  };

  let overallStatus = PASS;
  if (summary.fail > 0) overallStatus = FAIL;
  else if (summary.review > 0) overallStatus = REVIEW;

  const headline = {
    [PASS]: 'No discrepancies found',
    [REVIEW]: 'Needs a human look',
    [FAIL]: 'Discrepancies found',
  }[overallStatus];

  return { overallStatus, headline, summary, checks };
}

export const STATUS = { PASS, REVIEW, FAIL, SKIPPED };
