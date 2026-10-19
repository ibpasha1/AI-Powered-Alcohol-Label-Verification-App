import fs from 'node:fs';
import path from 'node:path';
import compression from 'compression';
import express from 'express';
import { config } from './config.js';
import { providerStatus } from './extraction/index.js';
import { shutdownTesseract } from './extraction/tesseract.js';
import { webDistDir } from './lib/paths.js';
import { apiRouter } from './routes/api.js';

const app = express();

app.disable('x-powered-by');
app.use(compression());
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

app.use('/api', apiRouter);

if (fs.existsSync(webDistDir)) {
  app.use(express.static(webDistDir, { maxAge: '1h', index: false }));
  app.get('*', (request, response, next) => {
    if (request.path.startsWith('/api/')) {
      next();
      return;
    }
    response.sendFile(path.join(webDistDir, 'index.html'));
  });
} else {
  app.get('/', (request, response) => {
    response
      .status(200)
      .type('text/plain')
      .send('API is running. The web client has not been built — run "npm run build" to serve it from here.');
  });
}

const server = app.listen(config.port, () => {
  const status = providerStatus();
  console.log(`[server] listening on port ${config.port}`);
  console.log(`[server] extraction provider: ${status.label}${status.ready ? '' : ' (NOT READY)'}`);
  if (!status.ready) {
    console.warn('[server] set ANTHROPIC_API_KEY, or set EXTRACTION_PROVIDER=tesseract to use local OCR.');
  }
});

async function shutdown(signal) {
  console.log(`[server] ${signal} received, shutting down`);
  server.close();
  await shutdownTesseract().catch(() => {});
  process.exit(0);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
