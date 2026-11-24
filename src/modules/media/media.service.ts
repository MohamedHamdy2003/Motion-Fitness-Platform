import { query } from '../../infrastructure/database/query';
import { Inject, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import {
  S3Client,
  PutObjectCommand,
  HeadObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  CopyObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { randomUUID } from 'node:crypto';
import { environment } from '../../config/environment';
import { ApiError } from '../../common/http';
import {
  IMMUTABLE_MEDIA_CACHE_CONTROL,
  MAX_AVATAR_IMAGE_BYTES,
  MAX_LIBRARY_IMAGE_BYTES,
  isOptimizableImageMime,
  optimizeUploadedImage,
} from './image-optimizer';

function matchesMagicBytes(mime: string, bytes: Buffer): boolean {
  if (mime === 'video/mp4') {
    return (
      bytes.length >= 16 &&
      bytes.subarray(4, 8).toString() === 'ftyp' &&
      [
        'isom',
        'iso2',
        'iso3',
        'iso4',
        'iso5',
        'iso6',
        'mp41',
        'mp42',
        'avc1',
        'dash',
        'M4V ',
      ].includes(bytes.subarray(8, 12).toString())
    );
  }
  if (mime === 'image/png') {
    return (
      bytes.length >= 8 &&
      bytes.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'))
    );
  }
  if (mime === 'image/jpeg') {
    return (
      bytes.length >= 3 &&
      bytes.subarray(0, 3).equals(Buffer.from('ffd8ff', 'hex'))
    );
  }
  return (
    bytes.length >= 12 &&
    bytes.subarray(0, 4).toString() === 'RIFF' &&
    bytes.subarray(8, 12).toString() === 'WEBP'
  );
}
@Injectable()
export class MediaService {
  constructor(@Inject(DataSource) private db: DataSource) {}
  client() {
    const e = environment();
    if (
      !e.S3_BUCKET ||
      (e.S3_AUTH_MODE === 'iam'
        ? !e.S3_REGION || e.S3_REGION === 'auto'
        : !e.S3_ACCESS_KEY_ID || !e.S3_SECRET_ACCESS_KEY)
    )
      throw new ApiError('STORAGE_NOT_CONFIGURED', 503);
    return new S3Client({
      ...(e.S3_ENDPOINT ? { endpoint: e.S3_ENDPOINT } : {}),
      region: e.S3_REGION,
      forcePathStyle: e.S3_FORCE_PATH_STYLE === 'true',
      ...(e.S3_AUTH_MODE === 'static'
        ? {
            credentials: {
              accessKeyId: e.S3_ACCESS_KEY_ID,
              secretAccessKey: e.S3_SECRET_ACCESS_KEY,
            },
          }
        : {}),
    });
  }

  async intent(id: string, mime: string, size: number, library = false) {
    const client = this.client();
    const mediaId = randomUUID();
    const key = `uploads/${library ? 'library' : 'avatars'}/${id}/${mediaId}`;
    const url = await getSignedUrl(
      client,
      new PutObjectCommand({
        Bucket: environment().S3_BUCKET,
        Key: key,
        ContentType: mime,
        ContentLength: size,
      }),
      { expiresIn: 300 },
    );
    await query(
      this.db,
      `INSERT INTO media_assets(id,owner_user_id,storage_key,upload_key,mime,size,status,library_asset) VALUES($1,$2,$3,$3,$4,$5,'PENDING',$6)`,
      [mediaId, id, key, mime, size, library],
    );
    return {
      id: mediaId,
      uploadUrl: url,
      method: 'PUT',
      headers: { 'Content-Type': mime, 'Content-Length': String(size) },
      expiresIn: 300,
    };
  }
  async finalize(userId: string, id: string, library = false) {
    const client = this.client();
    const [media] = await query(
      this.db,
      `SELECT * FROM media_assets WHERE id=$1 AND (owner_user_id=$2 OR ($3 AND owner_user_id IS NULL AND status='READY')) AND library_asset=$3 AND NOT library_archived`,
      [id, userId, library],
    );
    if (!media) throw new ApiError('NOT_FOUND', 404);
    if (media.status === 'READY')
      return { id, status: 'READY', mime: media.mime, size: media.size };
    let result;
    try {
      result = await client.send(
        new HeadObjectCommand({
          Bucket: environment().S3_BUCKET,
          Key: media.upload_key,
        }),
      );
    } catch {
      throw new ApiError('UPLOAD_NOT_FOUND', 422);
    }
    if (
      result.ContentLength !== media.size ||
      result.ContentType !== media.mime
    ) {
      await client.send(
        new DeleteObjectCommand({
          Bucket: environment().S3_BUCKET,
          Key: media.upload_key,
        }),
      );
      throw new ApiError('UPLOAD_METADATA_MISMATCH', 422);
    }
    if (!result.ETag) throw new ApiError('STORAGE_INVALID_RESPONSE', 502);

    const finalKey = `${library ? 'library' : 'avatars'}/${userId}/${id}/${randomUUID()}`;
    let finalMime: string = media.mime;
    let finalSize: number = media.size;
    let optimizedMeta:
      { originalSize: number; width: number; height: number } | undefined;

    if (isOptimizableImageMime(media.mime)) {
      const maxImageBytes = library
        ? MAX_LIBRARY_IMAGE_BYTES
        : MAX_AVATAR_IMAGE_BYTES;
      if (media.size > maxImageBytes) {
        await this.erase(media.upload_key);
        throw new ApiError('UPLOAD_TOO_LARGE', 422);
      }

      const uploaded = await client.send(
        new GetObjectCommand({
          Bucket: environment().S3_BUCKET,
          Key: media.upload_key,
          IfMatch: result.ETag,
        }),
      );
      const rawBytes = Buffer.from(await uploaded.Body!.transformToByteArray());
      if (!matchesMagicBytes(media.mime, rawBytes))
        throw new ApiError('UPLOAD_CONTENT_TYPE_MISMATCH', 422);

      const optimized = await optimizeUploadedImage(
        rawBytes,
        media.mime,
        library ? 'library' : 'avatar',
      );
      finalMime = optimized.mime;
      finalSize = optimized.size;
      optimizedMeta = {
        originalSize: optimized.originalSize,
        width: optimized.width,
        height: optimized.height,
      };

      await client.send(
        new PutObjectCommand({
          Bucket: environment().S3_BUCKET,
          Key: finalKey,
          Body: optimized.buffer,
          ContentType: finalMime,
          ContentLength: finalSize,
          CacheControl: IMMUTABLE_MEDIA_CACHE_CONTROL,
        }),
      );
    } else {
      const prefix = await client.send(
        new GetObjectCommand({
          Bucket: environment().S3_BUCKET,
          Key: media.upload_key,
          Range: 'bytes=0-15',
          IfMatch: result.ETag,
        }),
      );
      const bytes = Buffer.from(await prefix.Body!.transformToByteArray());
      if (!matchesMagicBytes(media.mime, bytes))
        throw new ApiError('UPLOAD_CONTENT_TYPE_MISMATCH', 422);

      await client.send(
        new CopyObjectCommand({
          Bucket: environment().S3_BUCKET,
          Key: finalKey,
          CopySource: encodeURIComponent(
            environment().S3_BUCKET + '/' + media.upload_key,
          ),
          CopySourceIfMatch: result.ETag,
          MetadataDirective: 'REPLACE',
          ContentType: media.mime,
          CacheControl: IMMUTABLE_MEDIA_CACHE_CONTROL,
        }),
      );
    }

    const [updated] = await query(
      this.db,
      `UPDATE media_assets SET status='READY',storage_key=$3,mime=$4,size=$5,owner_user_id=CASE WHEN library_asset THEN NULL ELSE owner_user_id END WHERE id=$1 AND owner_user_id=$2 AND status='PENDING' AND NOT library_archived AND EXISTS(SELECT 1 FROM users WHERE id=$2 AND status='ACTIVE') RETURNING id`,
      [id, userId, finalKey, finalMime, finalSize],
    );
    if (!updated) {
      await this.erase(finalKey);
      const [current] = await query(
        this.db,
        `SELECT a.id,a.mime,a.size FROM media_assets a WHERE a.id=$1 AND (a.owner_user_id=$2 OR (a.library_asset AND a.owner_user_id IS NULL)) AND a.status='READY' AND NOT a.library_archived`,
        [id, userId],
      );
      if (!current) throw new ApiError('ACCOUNT_UNAVAILABLE', 403);
      return {
        id,
        status: 'READY',
        mime: current.mime,
        size: current.size,
      };
    }
    await this.erase(media.upload_key);
    return {
      id,
      status: 'READY',
      mime: finalMime,
      size: finalSize,
      ...(optimizedMeta ?? {}),
    };
  }
  async get(userId: string | null, id: string) {
    const [m] = await query(
      this.db,
      `SELECT id,mime,size,status,storage_key FROM media_assets WHERE id=$1 AND owner_user_id IS NOT DISTINCT FROM $2::uuid AND NOT library_archived AND library_asset=($2::uuid IS NULL)`,
      [id, userId],
    );
    if (!m) throw new ApiError('NOT_FOUND', 404);
    const { storage_key, ...metadata } = m;
    return {
      ...metadata,
      ...(m.status === 'READY'
        ? {
            downloadUrl: await getSignedUrl(
              this.client(),
              new GetObjectCommand({
                Bucket: environment().S3_BUCKET,
                Key: storage_key,
              }),
              { expiresIn: 300 },
            ),
            expiresIn: 300,
          }
        : {}),
    };
  }
  async erase(key: string) {
    await this.client().send(
      new DeleteObjectCommand({ Bucket: environment().S3_BUCKET, Key: key }),
    );
  }
}
