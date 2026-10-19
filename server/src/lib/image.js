import sharp from 'sharp';
import { config } from '../config.js';

export async function prepareImage(buffer) {
  const image = sharp(buffer, { failOn: 'none' }).rotate();
  const metadata = await image.metadata();

  const longestEdge = Math.max(metadata.width ?? 0, metadata.height ?? 0);
  const pipeline = longestEdge > config.maxImageEdge
    ? image.resize({ width: metadata.width >= metadata.height ? config.maxImageEdge : undefined,
                     height: metadata.height > metadata.width ? config.maxImageEdge : undefined,
                     fit: 'inside',
                     withoutEnlargement: true })
    : image;

  const output = await pipeline.jpeg({ quality: 82, mozjpeg: true }).toBuffer({ resolveWithObject: true });

  return {
    buffer: output.data,
    mediaType: 'image/jpeg',
    width: output.info.width,
    height: output.info.height,
    originalWidth: metadata.width ?? null,
    originalHeight: metadata.height ?? null,
    originalBytes: buffer.length,
    preparedBytes: output.data.length,
  };
}

export async function toOcrBuffer(preparedBuffer) {
  return sharp(preparedBuffer).greyscale().normalise().sharpen().jpeg({ quality: 92 }).toBuffer();
}
