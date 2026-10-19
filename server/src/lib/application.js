import { BEVERAGE_CLASSES } from '../rules/reference.js';
import { collapseWhitespace } from '../rules/text.js';

const TRUTHY = new Set(['true', 'yes', 'y', '1', 'on', 'imported']);

function toText(value) {
  if (value === null || value === undefined) return '';
  return collapseWhitespace(String(value));
}

function toBoolean(value) {
  if (typeof value === 'boolean') return value;
  return TRUTHY.has(toText(value).toLowerCase());
}

function toAbv(value) {
  const text = toText(value).replace('%', '');
  if (text.length === 0) return null;
  const parsed = Number.parseFloat(text);
  return Number.isFinite(parsed) ? parsed : null;
}

export function buildApplication(input) {
  const source = input ?? {};
  const beverageClass = toText(source.beverageClass).toLowerCase().replace(/[\s-]+/g, '_');

  return {
    applicationId: toText(source.applicationId) || null,
    beverageClass: BEVERAGE_CLASSES.includes(beverageClass) ? beverageClass : 'distilled_spirits',
    brandName: toText(source.brandName),
    classType: toText(source.classType),
    alcoholContentAbv: toAbv(source.alcoholContentAbv),
    netContents: toText(source.netContents),
    bottlerName: toText(source.bottlerName),
    bottlerAddress: toText(source.bottlerAddress),
    isImported: toBoolean(source.isImported),
    countryOfOrigin: toText(source.countryOfOrigin),
  };
}

export function validateApplication(application) {
  const errors = [];
  if (application.brandName.length === 0) {
    errors.push({ field: 'brandName', message: 'Brand name is required.' });
  }
  if (application.netContents.length === 0) {
    errors.push({ field: 'netContents', message: 'Net contents is required.' });
  }
  if (application.alcoholContentAbv !== null) {
    if (application.alcoholContentAbv < 0 || application.alcoholContentAbv > 100) {
      errors.push({ field: 'alcoholContentAbv', message: 'Alcohol content must be between 0 and 100.' });
    }
  } else if (application.beverageClass !== 'malt_beverage') {
    errors.push({ field: 'alcoholContentAbv', message: 'Alcohol content is required for this beverage class.' });
  }
  if (application.isImported && application.countryOfOrigin.length === 0) {
    errors.push({ field: 'countryOfOrigin', message: 'Country of origin is required for imported products.' });
  }
  return errors;
}

export const APPLICATION_CSV_COLUMNS = [
  'file',
  'applicationId',
  'beverageClass',
  'brandName',
  'classType',
  'alcoholContentAbv',
  'netContents',
  'bottlerName',
  'bottlerAddress',
  'isImported',
  'countryOfOrigin',
];
