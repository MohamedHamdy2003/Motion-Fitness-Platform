import sharp from 'sharp';
import { ApiError } from '../../common/http';

export type ImageMime = 'image/jpeg' | 'image/png' | 'image/webp';
export type ImageOptimizationProfile = 'avatar' | 'library';

export const MAX_AVATAR_IMAGE_BYTES = 5 * 1024 * 1024; // 5 MiB
export const MAX_LIBRARY_IMAGE_BYTES = 15 * 1024 * 1024; // 15 MiB
export const MAX_LIBRARY_VIDEO_BYTES = 100 * 1024 * 1024; // 100 MiB

export const AVATAR_MAX_DIMENSION = 1024;
export const LIBRARY_MAX_DIMENSION = 1920;
export const MAX_INPUT_PIXELS = 268_402_689; // ~16384 x 16384 decompression-bomb guard

export const IMMUTABLE_MEDIA_CACHE_CONTROL =
  'private, max-age=31536000, immutable';

const EXPECTED_SHARP_FORMAT: Record<ImageMime, string> = {
  'image/jpeg': 'jpeg',
  'image/png': 'png',
  'image/webp': 'webp',
};

export interface OptimizedImageResult {
  buffer: Buffer;
  mime: 'image/webp';
  size: number;
  originalSize: number;
  width: number;
  height: number;
}

export function isOptimizableImageMime(mime: string): mime is ImageMime {
  return mime === 'image/jpeg' || mime === 'image/png' || mime === 'image/webp';
}

export async function optimizeUploadedImage(
  input: Buffer,
  declaredMime: ImageMime,
  profile: ImageOptimizationProfile,
): Promise<OptimizedImageResult> {
  let metadata: sharp.Metadata;
  try {
    metadata = await sharp(input, {
      limitInputPixels: MAX_INPUT_PIXELS,
      failOn: 'error',
    }).metadata();
  } catch {
    throw new ApiError('UPLOAD_CONTENT_TYPE_MISMATCH', 422);
  }

  const expectedFormat = EXPECTED_SHARP_FORMAT[declaredMime];
  if (
    !metadata.format ||
    metadata.format !== expectedFormat ||
    !metadata.width ||
    !metadata.height
  ) {
    throw new ApiError('UPLOAD_CONTENT_TYPE_MISMATCH', 422);
  }

  const maxDim =
    profile === 'avatar' ? AVATAR_MAX_DIMENSION : LIBRARY_MAX_DIMENSION;

  try {
    const basePipeline = sharp(input, {
      limitInputPixels: MAX_INPUT_PIXELS,
      failOn: 'error',
      animated: false,
    })
      .rotate()
      .resize({
        width: maxDim,
        height: maxDim,
        fit: 'inside',
        withoutEnlargement: true,
      });

    // Visually lossless WebP: preserves sharp edges, high alpha fidelity,
    // strips EXIF/GPS/camera metadata, and saves ~65-85% on photos.
    let best = await basePipeline
      .clone()
      .webp({
        quality: 85,
        alphaQuality: 95,
        effort: 5,
        smartSubsample: true,
      })
      .toBuffer({ resolveWithObject: true });

    // For tiny or flat-color PNG/WebP graphics, lossless WebP can sometimes
    // be even smaller than lossy WebP; pick the smaller result.
    if (
      (declaredMime === 'image/png' || declaredMime === 'image/webp') &&
      best.data.length > input.length
    ) {
      const lossless = await basePipeline
        .clone()
        .webp({ lossless: true, effort: 5 })
        .toBuffer({ resolveWithObject: true });
      if (lossless.data.length < best.data.length) {
        best = lossless;
      }
    }

    // Never bloat an already clean, properly sized WebP image with no metadata.
    const alreadyCleanWebp =
      declaredMime === 'image/webp' &&
      metadata.width <= maxDim &&
      metadata.height <= maxDim &&
      (!metadata.orientation || metadata.orientation === 1) &&
      !metadata.exif &&
      !metadata.xmp &&
      !metadata.iptc &&
      !metadata.icc;

    if (alreadyCleanWebp && best.data.length >= input.length) {
      return {
        buffer: input,
        mime: 'image/webp',
        size: input.length,
        originalSize: input.length,
        width: metadata.width,
        height: metadata.height,
      };
    }

    return {
      buffer: best.data,
      mime: 'image/webp',
      size: best.data.length,
      originalSize: input.length,
      width: best.info.width,
      height: best.info.height,
    };
  } catch (err) {
    if (err instanceof ApiError) throw err;
    throw new ApiError('UPLOAD_CONTENT_TYPE_MISMATCH', 422);
  }
}
