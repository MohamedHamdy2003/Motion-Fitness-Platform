import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import {
  AVATAR_MAX_DIMENSION,
  LIBRARY_MAX_DIMENSION,
  optimizeUploadedImage,
} from '../../src/modules/media/image-optimizer';

async function makeDetailedPhotoJpeg(width: number, height: number) {
  const channels = 3;
  const raw = Buffer.alloc(width * height * channels);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * channels;
      raw[idx] = (x * 13 + y * 7) % 256;
      raw[idx + 1] = (x * 5 + y * 17) % 256;
      raw[idx + 2] = ((x ^ y) * 3) % 256;
    }
  }
  return sharp(raw, { raw: { width, height, channels } })
    .withExif({
      IFD0: {
        Make: 'CameraVendor',
        Model: 'TestCamera',
        ImageDescription: 'Private GPS metadata test',
      },
    })
    .jpeg({ quality: 98, chromaSubsampling: '4:4:4' })
    .toBuffer();
}

describe('optimizeUploadedImage', () => {
  it('compresses large avatar JPEGs to visually lossless WebP, caps at 1024px, and strips EXIF metadata', async () => {
    const source = await makeDetailedPhotoJpeg(2400, 1600);
    const result = await optimizeUploadedImage(source, 'image/jpeg', 'avatar');

    expect(result.mime).toBe('image/webp');
    expect(result.originalSize).toBe(source.length);
    expect(result.size).toBe(result.buffer.length);
    expect(result.size).toBeLessThan(source.length * 0.4);
    expect(result.width).toBeLessThanOrEqual(AVATAR_MAX_DIMENSION);
    expect(result.height).toBeLessThanOrEqual(AVATAR_MAX_DIMENSION);
    expect(result.width).toBe(1024);
    expect(result.height).toBe(683);

    const outMeta = await sharp(result.buffer).metadata();
    expect(outMeta.format).toBe('webp');
    expect(outMeta.exif).toBeUndefined();
  });

  it('caps library images at 1920px without upscaling small transparent PNGs', async () => {
    const bigJpeg = await makeDetailedPhotoJpeg(2600, 1300);
    const bigResult = await optimizeUploadedImage(
      bigJpeg,
      'image/jpeg',
      'library',
    );
    expect(bigResult.width).toBe(LIBRARY_MAX_DIMENSION);
    expect(bigResult.height).toBe(960);

    const transparentPng = await sharp({
      create: {
        width: 320,
        height: 240,
        channels: 4,
        background: { r: 197, g: 245, b: 47, alpha: 0.5 },
      },
    })
      .png({ compressionLevel: 0 })
      .toBuffer();

    const pngResult = await optimizeUploadedImage(
      transparentPng,
      'image/png',
      'library',
    );
    expect(pngResult.mime).toBe('image/webp');
    expect(pngResult.width).toBe(320);
    expect(pngResult.height).toBe(240);
    expect(pngResult.size).toBeLessThan(transparentPng.length);

    const outMeta = await sharp(pngResult.buffer).metadata();
    expect(outMeta.hasAlpha).toBe(true);
  });

  it('auto-orients EXIF-rotated photos before stripping orientation metadata', async () => {
    const rotated = await sharp({
      create: {
        width: 400,
        height: 200,
        channels: 3,
        background: { r: 30, g: 120, b: 80 },
      },
    })
      .withMetadata({ orientation: 6 })
      .jpeg({ quality: 92 })
      .toBuffer();

    const inMeta = await sharp(rotated).metadata();
    expect(inMeta.orientation).toBe(6);

    const result = await optimizeUploadedImage(rotated, 'image/jpeg', 'avatar');
    expect(result.width).toBe(200);
    expect(result.height).toBe(400);
    const outMeta = await sharp(result.buffer).metadata();
    expect(outMeta.exif).toBeUndefined();
    expect(outMeta.orientation).toBeUndefined();
  });

  it('never bloats an already-clean WebP image', async () => {
    const cleanWebp = await sharp({
      create: {
        width: 240,
        height: 240,
        channels: 3,
        background: { r: 168, g: 236, b: 23 },
      },
    })
      .webp({ quality: 70, effort: 6 })
      .toBuffer();

    const result = await optimizeUploadedImage(
      cleanWebp,
      'image/webp',
      'library',
    );
    expect(result.mime).toBe('image/webp');
    expect(result.size).toBeLessThanOrEqual(cleanWebp.length);
  });

  it('rejects spoofed or truncated images with UPLOAD_CONTENT_TYPE_MISMATCH', async () => {
    const truncatedPng = Buffer.from('89504e470d0a1a0a0000000000000000', 'hex');
    await expect(
      optimizeUploadedImage(truncatedPng, 'image/png', 'avatar'),
    ).rejects.toMatchObject({
      code: 'UPLOAD_CONTENT_TYPE_MISMATCH',
      status: 422,
    });

    const realJpeg = await sharp({
      create: {
        width: 32,
        height: 32,
        channels: 3,
        background: { r: 10, g: 20, b: 30 },
      },
    })
      .jpeg()
      .toBuffer();

    await expect(
      optimizeUploadedImage(realJpeg, 'image/png', 'avatar'),
    ).rejects.toMatchObject({
      code: 'UPLOAD_CONTENT_TYPE_MISMATCH',
      status: 422,
    });
  });
});
