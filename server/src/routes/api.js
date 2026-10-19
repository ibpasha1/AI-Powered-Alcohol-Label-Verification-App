import fs from 'node:fs/promises';
import path from 'node:path';
import express from 'express';
import multer from 'multer';
import { ACCEPTED_IMAGE_TYPES, config } from '../config.js';
import { providerStatus } from '../extraction/index.js';
import { APPLICATION_CSV_COLUMNS, buildApplication, validateApplication } from '../lib/application.js';
import { csvToObjects, objectsToCsv } from '../lib/csv.js';
import { samplesDir } from '../lib/paths.js';
import { mapWithConcurrency, verifyLabelImage } from '../service.js';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.maxUploadBytes, files: config.maxBatchFiles + 1 },
  fileFilter(request, file, callback) {
    if (file.fieldname === 'manifest') {
      callback(null, true);
      return;
    }
    if (ACCEPTED_IMAGE_TYPES.has(file.mimetype)) {
      callback(null, true);
      return;
    }
    callback(new UploadError(`"${file.originalname}" is not a supported image. Use JPEG, PNG, WebP or TIFF.`));
  },
});

export class UploadError extends Error {
  constructor(message) {
    super(message);
    this.name = 'UploadError';
    this.status = 400;
  }
}

let sampleManifestCache = null;

async function loadSamples() {
  if (!sampleManifestCache) {
    const raw = await fs.readFile(path.join(samplesDir, 'manifest.json'), 'utf8');
    sampleManifestCache = JSON.parse(raw);
  }
  return sampleManifestCache;
}

function friendlyError(error) {
  if (error?.code === 'LIMIT_FILE_SIZE') {
    return { status: 413, message: `That image is larger than ${Math.round(config.maxUploadBytes / (1024 * 1024))} MB. Please upload a smaller file.` };
  }
  if (error?.code === 'LIMIT_FILE_COUNT') {
    return { status: 413, message: `A batch can hold at most ${config.maxBatchFiles} label images.` };
  }
  if (error?.status === 400 || error?.name === 'UploadError') {
    return { status: 400, message: error.message };
  }
  if (error?.status === 401 || error?.status === 403) {
    return { status: 502, message: 'The extraction service rejected our credentials. Check the API key configuration.' };
  }
  if (error?.status === 429) {
    return { status: 429, message: 'The extraction service is rate limiting us. Wait a moment and try again.' };
  }
  if (error?.name === 'APIConnectionTimeoutError' || /timeout/i.test(error?.message ?? '')) {
    return { status: 504, message: 'Reading the label took too long. Try again, or upload a smaller image.' };
  }
  return { status: 500, message: error?.message || 'Something went wrong while checking that label.' };
}

export const apiRouter = express.Router();

apiRouter.get('/health', (request, response) => {
  response.json({
    status: 'ok',
    provider: providerStatus(),
    limits: {
      maxUploadBytes: config.maxUploadBytes,
      maxBatchFiles: config.maxBatchFiles,
      batchConcurrency: config.batchConcurrency,
    },
  });
});

apiRouter.get('/samples', async (request, response, next) => {
  try {
    const samples = await loadSamples();
    response.json(
      samples.map((sample) => ({
        id: sample.id,
        title: sample.title,
        expectation: sample.expectation,
        imageUrl: `/api/samples/${sample.id}/image`,
        application: sample.application,
      })),
    );
  } catch (error) {
    next(error);
  }
});

apiRouter.get('/samples/:id/image', async (request, response, next) => {
  try {
    const samples = await loadSamples();
    const sample = samples.find((item) => item.id === request.params.id);
    if (!sample) {
      response.status(404).json({ error: 'Sample not found.' });
      return;
    }
    response.sendFile(path.join(samplesDir, sample.image));
  } catch (error) {
    next(error);
  }
});

apiRouter.get('/batch-template.csv', (request, response) => {
  const headers = APPLICATION_CSV_COLUMNS.map((key) => ({ key }));
  const example = {
    file: 'old-tom-bourbon-clean.jpg',
    applicationId: 'TTB-2026-00141',
    beverageClass: 'distilled_spirits',
    brandName: 'OLD TOM DISTILLERY',
    classType: 'Kentucky Straight Bourbon Whiskey',
    alcoholContentAbv: '45',
    netContents: '750 mL',
    bottlerName: 'DISTILLED AND BOTTLED BY OLD TOM DISTILLERY',
    bottlerAddress: 'BARDSTOWN, KENTUCKY',
    isImported: 'no',
    countryOfOrigin: '',
  };
  response.type('text/csv').attachment('label-applications-template.csv').send(objectsToCsv(headers, [example]));
});

apiRouter.post('/verify', upload.single('label'), async (request, response, next) => {
  try {
    if (!request.file) {
      throw new UploadError('Please attach a label image.');
    }
    const application = buildApplication(request.body);
    const errors = validateApplication(application);
    if (errors.length > 0) {
      response.status(422).json({ error: 'Please correct the application details.', fieldErrors: errors });
      return;
    }

    const result = await verifyLabelImage(application, request.file.buffer);
    response.json({ ...result, fileName: request.file.originalname });
  } catch (error) {
    next(error);
  }
});

apiRouter.post(
  '/verify/batch',
  upload.fields([
    { name: 'labels', maxCount: config.maxBatchFiles },
    { name: 'manifest', maxCount: 1 },
  ]),
  async (request, response, next) => {
    try {
      const files = request.files?.labels ?? [];
      if (files.length === 0) {
        throw new UploadError('Please attach at least one label image.');
      }

      let rows = [];
      const manifestFile = request.files?.manifest?.[0];
      if (manifestFile) {
        rows = csvToObjects(manifestFile.buffer.toString('utf8'));
      } else if (typeof request.body.applications === 'string' && request.body.applications.trim().length > 0) {
        rows = JSON.parse(request.body.applications);
      }
      if (!Array.isArray(rows) || rows.length === 0) {
        throw new UploadError('Please attach a CSV of application details to match against the images.');
      }

      const byName = new Map(files.map((file) => [file.originalname, file]));
      const items = rows.map((row, index) => {
        const fileName = String(row.file ?? row.fileName ?? '').trim();
        return { row, index, fileName, file: byName.get(fileName) ?? null };
      });

      const unmatchedFiles = files
        .filter((file) => !items.some((item) => item.file === file))
        .map((file) => file.originalname);

      const startedAt = Date.now();
      const results = await mapWithConcurrency(items, config.batchConcurrency, async (item) => {
        const application = buildApplication(item.row);
        const base = {
          row: item.index + 1,
          fileName: item.fileName,
          applicationId: application.applicationId,
          brandName: application.brandName,
        };

        if (!item.file) {
          return { ...base, ok: false, error: `No uploaded image named "${item.fileName}".` };
        }
        const fieldErrors = validateApplication(application);
        if (fieldErrors.length > 0) {
          return { ...base, ok: false, error: fieldErrors.map((entry) => entry.message).join(' ') };
        }

        try {
          const result = await verifyLabelImage(application, item.file.buffer);
          return { ...base, ok: true, result };
        } catch (error) {
          return { ...base, ok: false, error: friendlyError(error).message };
        }
      });

      const completed = results.filter((item) => item.ok);
      response.json({
        totalMs: Date.now() - startedAt,
        counts: {
          submitted: results.length,
          processed: completed.length,
          failed: results.length - completed.length,
          pass: completed.filter((item) => item.result.overallStatus === 'pass').length,
          review: completed.filter((item) => item.result.overallStatus === 'review').length,
          fail: completed.filter((item) => item.result.overallStatus === 'fail').length,
        },
        unmatchedFiles,
        results,
      });
    } catch (error) {
      next(error);
    }
  },
);

apiRouter.use((error, request, response, next) => {
  const { status, message } = friendlyError(error);
  if (status >= 500) {
    console.error(`[api] ${request.method} ${request.originalUrl}`, error);
  }
  response.status(status).json({ error: message });
});
