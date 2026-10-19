import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const here = path.dirname(fileURLToPath(import.meta.url));
const outputDir = path.join(here, '..', 'samples');

const STATUTORY_WARNING_BODY =
  '(1) According to the Surgeon General, women should not drink alcoholic beverages during pregnancy ' +
  'because of the risk of birth defects. (2) Consumption of alcoholic beverages impairs your ability ' +
  'to drive a car or operate machinery, and may cause health problems.';

function escapeXml(value) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function wrap(text, maxChars) {
  const words = text.split(/\s+/);
  const lines = [];
  let line = '';
  for (const word of words) {
    const candidate = line.length === 0 ? word : `${line} ${word}`;
    if (candidate.length > maxChars) {
      if (line.length > 0) lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line.length > 0) lines.push(line);
  return lines;
}

function labelSvg(spec) {
  const width = 900;
  const height = 1280;
  const centre = width / 2;
  const accent = spec.accent ?? '#7a2e1d';
  const paper = spec.paper ?? '#f4ecdc';
  const ink = spec.ink ?? '#231d16';

  const warningHeading = spec.warningHeading ?? 'GOVERNMENT WARNING:';
  const warningBody = spec.warningBody ?? STATUTORY_WARNING_BODY;
  const warningLines = wrap(`${warningHeading} ${warningBody}`, 86);
  const warningStartY = height - 62 - warningLines.length * 21;

  const warningTspans = warningLines
    .map((line, index) => {
      const y = warningStartY + index * 21;
      if (index === 0) {
        const headingPart = escapeXml(warningHeading);
        const rest = escapeXml(line.slice(warningHeading.length));
        const weight = spec.warningBold === false ? '400' : '700';
        return `<text x="60" y="${y}" xml:space="preserve" font-family="sans-serif" font-size="15.5" fill="${ink}"><tspan font-weight="${weight}">${headingPart}</tspan><tspan>${rest}</tspan></text>`;
      }
      return `<text x="60" y="${y}" font-family="sans-serif" font-size="15.5" fill="${ink}">${escapeXml(line)}</text>`;
    })
    .join('\n');

  let cursor = 286;
  const brandLines = wrap(spec.brandName, 16);
  const brandText = brandLines
    .map(
      (line, index) =>
        `<text x="${centre}" y="${cursor + index * 78}" text-anchor="middle" font-family="serif" font-size="68" font-weight="700" letter-spacing="4" fill="${accent}">${escapeXml(line)}</text>`,
    )
    .join('\n');
  cursor += (brandLines.length - 1) * 78;

  const ruleY = cursor + 44;
  cursor = ruleY + 58;

  const classLines = wrap(spec.classType, 30);
  const classText = classLines
    .map(
      (line, index) =>
        `<text x="${centre}" y="${cursor + index * 46}" text-anchor="middle" font-family="serif" font-size="38" letter-spacing="2" fill="${ink}">${escapeXml(line)}</text>`,
    )
    .join('\n');
  cursor += (classLines.length - 1) * 46;

  const optionalLines = [];
  if (spec.countryOfOrigin) optionalLines.push(`PRODUCT OF ${spec.countryOfOrigin.toUpperCase()}`);
  if (spec.sulfiteDeclaration) optionalLines.push(spec.sulfiteDeclaration);

  cursor += 70;
  const optionalText = optionalLines
    .map(
      (line, index) =>
        `<text x="${centre}" y="${cursor + index * 34}" text-anchor="middle" font-family="sans-serif" font-size="21" letter-spacing="1" fill="${ink}">${escapeXml(line)}</text>`,
    )
    .join('\n');
  if (optionalLines.length > 0) cursor += (optionalLines.length - 1) * 34 + 40;

  const alcoholY = cursor + 96;
  const netContentsY = alcoholY + 50;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="${width}" height="${height}" fill="${paper}"/>
  <rect x="26" y="26" width="${width - 52}" height="${height - 52}" fill="none" stroke="${accent}" stroke-width="4"/>
  <rect x="42" y="42" width="${width - 84}" height="${height - 84}" fill="none" stroke="${accent}" stroke-width="1.5"/>

  <text x="${centre}" y="152" text-anchor="middle" font-family="serif" font-size="24" letter-spacing="7" fill="${accent}">${escapeXml(spec.topLine ?? 'ESTABLISHED 1887')}</text>
  <line x1="300" y1="180" x2="600" y2="180" stroke="${accent}" stroke-width="2"/>

  ${brandText}
  <line x1="220" y1="${ruleY}" x2="680" y2="${ruleY}" stroke="${accent}" stroke-width="2"/>
  ${classText}
  ${optionalText}

  <text x="${centre}" y="${alcoholY}" text-anchor="middle" font-family="sans-serif" font-size="30" letter-spacing="2" fill="${ink}">${escapeXml(spec.alcoholText)}</text>
  <text x="${centre}" y="${netContentsY}" text-anchor="middle" font-family="sans-serif" font-size="30" letter-spacing="2" fill="${ink}">${escapeXml(spec.netContentsText)}</text>

  <text x="${centre}" y="${warningStartY - 96}" text-anchor="middle" font-family="sans-serif" font-size="19" fill="${ink}">${escapeXml(spec.bottlerName)}</text>
  <text x="${centre}" y="${warningStartY - 68}" text-anchor="middle" font-family="sans-serif" font-size="19" fill="${ink}">${escapeXml(spec.bottlerAddress)}</text>

  ${warningTspans}
</svg>`;
}

async function render(spec) {
  let pipeline = sharp(Buffer.from(labelSvg(spec)), { density: 144 });

  if (spec.photograph) {
    pipeline = pipeline
      .rotate(spec.photograph.angle ?? 0, { background: '#2b2b2b' })
      .modulate({ brightness: spec.photograph.brightness ?? 1 })
      .blur(spec.photograph.blur ?? 0.4);
  }

  const file = path.join(outputDir, `${spec.id}.jpg`);
  await pipeline.jpeg({ quality: 88 }).toFile(file);
  return file;
}

const samples = [
  {
    id: 'old-tom-bourbon-clean',
    title: 'Old Tom Distillery — clean bourbon label',
    expectation: 'Everything matches the application. Should come back clean.',
    brandName: 'OLD TOM DISTILLERY',
    classType: 'Kentucky Straight Bourbon Whiskey',
    alcoholText: '45% ALC./VOL. (90 PROOF)',
    netContentsText: '750 mL',
    bottlerName: 'DISTILLED AND BOTTLED BY OLD TOM DISTILLERY',
    bottlerAddress: 'BARDSTOWN, KENTUCKY',
    application: {
      applicationId: 'TTB-2026-00141',
      beverageClass: 'distilled_spirits',
      brandName: 'OLD TOM DISTILLERY',
      classType: 'Kentucky Straight Bourbon Whiskey',
      alcoholContentAbv: 45,
      netContents: '750 mL',
      bottlerName: 'DISTILLED AND BOTTLED BY OLD TOM DISTILLERY',
      bottlerAddress: 'BARDSTOWN, KENTUCKY',
      isImported: false,
      countryOfOrigin: '',
    },
  },
  {
    id: 'old-tom-bourbon-volume-mismatch',
    title: 'Old Tom Distillery — wrong net contents',
    expectation: 'Label reads 700 mL while the application says 750 mL.',
    brandName: 'OLD TOM DISTILLERY',
    classType: 'Kentucky Straight Bourbon Whiskey',
    alcoholText: '45% ALC./VOL. (90 PROOF)',
    netContentsText: '700 mL',
    bottlerName: 'DISTILLED AND BOTTLED BY OLD TOM DISTILLERY',
    bottlerAddress: 'BARDSTOWN, KENTUCKY',
    application: {
      applicationId: 'TTB-2026-00142',
      beverageClass: 'distilled_spirits',
      brandName: 'OLD TOM DISTILLERY',
      classType: 'Kentucky Straight Bourbon Whiskey',
      alcoholContentAbv: 45,
      netContents: '750 mL',
      bottlerName: 'DISTILLED AND BOTTLED BY OLD TOM DISTILLERY',
      bottlerAddress: 'BARDSTOWN, KENTUCKY',
      isImported: false,
      countryOfOrigin: '',
    },
  },
  {
    id: 'harbor-light-gin-bad-warning',
    title: 'Harbor Light Gin — defective health warning',
    expectation: 'Heading is title case, not bold, and one word of the statement was changed.',
    accent: '#1f4e5f',
    paper: '#eef3f2',
    topLine: 'SMALL BATCH',
    brandName: 'HARBOR LIGHT',
    classType: 'London Dry Gin',
    alcoholText: '47% ALC./VOL. (94 PROOF)',
    netContentsText: '750 mL',
    bottlerName: 'DISTILLED AND BOTTLED BY HARBOR LIGHT SPIRITS CO.',
    bottlerAddress: 'PORTLAND, MAINE',
    warningHeading: 'Government Warning:',
    warningBold: false,
    warningBody: STATUTORY_WARNING_BODY.replace('may cause health problems', 'can cause health issues'),
    application: {
      applicationId: 'TTB-2026-00143',
      beverageClass: 'distilled_spirits',
      brandName: 'HARBOR LIGHT',
      classType: 'London Dry Gin',
      alcoholContentAbv: 47,
      netContents: '750 mL',
      bottlerName: 'DISTILLED AND BOTTLED BY HARBOR LIGHT SPIRITS CO.',
      bottlerAddress: 'PORTLAND, MAINE',
      isImported: false,
      countryOfOrigin: '',
    },
  },
  {
    id: 'stones-throw-rye-case-difference',
    title: "Stone's Throw Rye — capitalisation difference only",
    expectation: "Label prints the brand in caps, application uses title case. Same product, so this should be flagged for a look rather than failed.",
    accent: '#4a3b1f',
    paper: '#f1e9d7',
    topLine: 'CASK STRENGTH',
    brandName: "STONE'S THROW",
    classType: 'Straight Rye Whiskey',
    alcoholText: '52.5% ALC./VOL. (105 PROOF)',
    netContentsText: '750 mL',
    bottlerName: 'BOTTLED BY STONE’S THROW DISTILLING',
    bottlerAddress: 'LOUISVILLE, KENTUCKY',
    application: {
      applicationId: 'TTB-2026-00144',
      beverageClass: 'distilled_spirits',
      brandName: "Stone's Throw",
      classType: 'Straight Rye Whiskey',
      alcoholContentAbv: 52.5,
      netContents: '750 mL',
      bottlerName: "Bottled by Stone's Throw Distilling",
      bottlerAddress: 'Louisville, Kentucky',
      isImported: false,
      countryOfOrigin: '',
    },
  },
  {
    id: 'cedar-ridge-merlot-photographed',
    title: 'Cedar Ridge Merlot — photographed at an angle',
    expectation: 'Imported wine, image is tilted and slightly soft to exercise the vision model.',
    accent: '#5d1b3a',
    paper: '#f6f0ef',
    topLine: 'ESTATE BOTTLED',
    brandName: 'CEDAR RIDGE',
    classType: 'Merlot',
    alcoholText: '13.5% ALC./VOL.',
    netContentsText: '750 mL',
    countryOfOrigin: 'Chile',
    sulfiteDeclaration: 'CONTAINS SULFITES',
    bottlerName: 'IMPORTED BY CEDAR RIDGE IMPORTS',
    bottlerAddress: 'NAPA, CALIFORNIA',
    photograph: { angle: 6.5, brightness: 1.06, blur: 0.9 },
    application: {
      applicationId: 'TTB-2026-00145',
      beverageClass: 'wine',
      brandName: 'CEDAR RIDGE',
      classType: 'Merlot',
      alcoholContentAbv: 13.5,
      netContents: '750 mL',
      bottlerName: 'IMPORTED BY CEDAR RIDGE IMPORTS',
      bottlerAddress: 'NAPA, CALIFORNIA',
      isImported: true,
      countryOfOrigin: 'Chile',
    },
  },
];

await fs.mkdir(outputDir, { recursive: true });

const manifest = [];
for (const spec of samples) {
  const file = await render(spec);
  manifest.push({
    id: spec.id,
    title: spec.title,
    expectation: spec.expectation,
    image: `${spec.id}.jpg`,
    application: spec.application,
  });
  console.log(`rendered ${path.relative(process.cwd(), file)}`);
}

await fs.writeFile(path.join(outputDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`wrote ${path.relative(process.cwd(), path.join(outputDir, 'manifest.json'))}`);
