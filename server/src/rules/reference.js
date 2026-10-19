export const GOVERNMENT_WARNING_HEADING = 'GOVERNMENT WARNING:';

export const GOVERNMENT_WARNING_BODY =
  '(1) According to the Surgeon General, women should not drink alcoholic beverages during pregnancy ' +
  'because of the risk of birth defects. (2) Consumption of alcoholic beverages impairs your ability ' +
  'to drive a car or operate machinery, and may cause health problems.';

export const GOVERNMENT_WARNING_FULL = `${GOVERNMENT_WARNING_HEADING} ${GOVERNMENT_WARNING_BODY}`;

export const BEVERAGE_CLASSES = ['distilled_spirits', 'wine', 'malt_beverage'];

export const BEVERAGE_CLASS_LABELS = {
  distilled_spirits: 'Distilled spirits',
  wine: 'Wine',
  malt_beverage: 'Malt beverage',
};

export const ABV_TOLERANCE = {
  distilled_spirits: {
    tolerance: () => 0.15,
    citation: '27 CFR 5.65(a)',
  },
  wine: {
    tolerance: (abv) => (abv > 14 ? 1.0 : 1.5),
    citation: '27 CFR 4.36(b)',
  },
  malt_beverage: {
    tolerance: () => 0.3,
    citation: '27 CFR 7.71',
  },
};

export const STANDARDS_OF_FILL_ML = {
  distilled_spirits: {
    sizes: [50, 100, 200, 331, 355, 375, 500, 700, 720, 750, 900, 945, 1000, 1500, 1750, 1800],
    citation: '27 CFR 5.203',
  },
  wine: {
    sizes: [50, 100, 187, 200, 250, 355, 375, 500, 568, 600, 620, 700, 720, 750, 1000, 1500, 3000],
    citation: '27 CFR 4.72',
  },
  malt_beverage: {
    sizes: null,
    citation: '27 CFR 7.70',
  },
};

export const REQUIRED_FIELDS = {
  distilled_spirits: {
    citation: '27 CFR 5.63',
    fields: ['brandName', 'classType', 'alcoholContent', 'netContents', 'bottler'],
  },
  wine: {
    citation: '27 CFR 4.32',
    fields: ['brandName', 'classType', 'alcoholContent', 'netContents', 'bottler'],
  },
  malt_beverage: {
    citation: '27 CFR 7.63',
    fields: ['brandName', 'classType', 'netContents', 'bottler'],
  },
};

export const FIELD_LABELS = {
  brandName: 'Brand name',
  classType: 'Class / type designation',
  alcoholContent: 'Alcohol content',
  netContents: 'Net contents',
  bottler: 'Name and address of bottler / producer',
};

export const VOLUME_UNITS_ML = {
  ml: 1,
  milliliter: 1,
  milliliters: 1,
  millilitre: 1,
  millilitres: 1,
  cl: 10,
  centiliter: 10,
  centiliters: 10,
  centilitre: 10,
  centilitres: 10,
  dl: 100,
  l: 1000,
  liter: 1000,
  liters: 1000,
  litre: 1000,
  litres: 1000,
  floz: 29.5735295625,
  fluidounce: 29.5735295625,
  fluidounces: 29.5735295625,
  pint: 473.176473,
  pints: 473.176473,
  quart: 946.352946,
  quarts: 946.352946,
  gallon: 3785.411784,
  gallons: 3785.411784,
};
