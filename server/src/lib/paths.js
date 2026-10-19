import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

export const projectRoot = path.resolve(here, '..', '..', '..');
export const samplesDir = path.join(projectRoot, 'samples');
export const webDistDir = path.join(projectRoot, 'web', 'dist');
