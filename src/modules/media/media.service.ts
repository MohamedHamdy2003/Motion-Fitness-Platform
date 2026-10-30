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
@Injectable()
export class MediaService {
  constructor(@Inject(DataSource) private db: DataSource) {}
  client() {
    const e = environment();
    if (
      !e.S3_ENDPOINT ||
      !e.S3_BUCKET ||
      !e.S3_ACCESS_KEY_ID ||
      !e.S3_SECRET_ACCESS_KEY
    )
      throw new ApiError('STORAGE_NOT_CONFIGURED', 503);
    return new S3Client({
      endpoint: e.S3_ENDPOINT,
      region: e.S3_REGION,
      credentials: {
        accessKeyId: e.S3_ACCESS_KEY_ID,
        secretAccessKey: e.S3_SECRET_ACCESS_KEY,
      },
    });
  }
  async intent(id: string, mime: string, size: number) {
    const client = this.client();
    const mediaId = randomUUID();
    const key = `uploads/avatars/${id}/${mediaId}`;
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
      `INSERT INTO media_assets(id,owner_user_id,storage_key,upload_key,mime,size,status) VALUES($1,$2,$3,$3,$4,$5,'PENDING')`,
      [mediaId, id, key, mime, size],
    );
    return {
      id: mediaId,
      uploadUrl: url,
      method: 'PUT',
      headers: { 'Content-Type': mime, 'Content-Length': String(size) },
      expiresIn: 300,
    };
  }
  async finalize(userId: string, id: string) {
    const client = this.client();
    const [media] = await query(
      this.db,
      `SELECT * FROM media_assets WHERE id=$1 AND owner_user_id=$2`,
      [id, userId],
    );
    if (!media) throw new ApiError('NOT_FOUND', 404);
    if (media.status === 'READY') return { id, status: 'READY' };
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
    const prefix = await client.send(
      new GetObjectCommand({
        Bucket: environment().S3_BUCKET,
        Key: media.upload_key,
        Range: 'bytes=0-15',
        IfMatch: result.ETag,
      }),
    );
    const bytes = Buffer.from(await prefix.Body!.transformToByteArray());
    const valid =
      media.mime === 'image/png'
        ? bytes.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'))
        : media.mime === 'image/jpeg'
          ? bytes.subarray(0, 3).equals(Buffer.from('ffd8ff', 'hex'))
          : bytes.subarray(0, 4).toString() === 'RIFF' &&
            bytes.subarray(8, 12).toString() === 'WEBP';
    if (!valid) throw new ApiError('UPLOAD_CONTENT_TYPE_MISMATCH', 422);
    const finalKey = `avatars/${userId}/${id}/${randomUUID()}`;
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
        CacheControl: 'private,max-age=300',
      }),
    );
    const [updated] = await query(
      this.db,
      `UPDATE media_assets SET status='READY',storage_key=$3 WHERE id=$1 AND owner_user_id=$2 AND status='PENDING' AND EXISTS(SELECT 1 FROM users WHERE id=$2 AND status='ACTIVE') RETURNING id`,
      [id, userId, finalKey],
    );
    if (!updated) {
      await this.erase(finalKey);
      const [current] = await query(
        this.db,
        `SELECT a.id FROM media_assets a JOIN users u ON u.id=a.owner_user_id WHERE a.id=$1 AND a.owner_user_id=$2 AND a.status='READY' AND u.status='ACTIVE'`,
        [id, userId],
      );
      if (!current) throw new ApiError('ACCOUNT_UNAVAILABLE', 403);
    }
    await this.erase(media.upload_key);
    return { id, status: 'READY' };
  }
  async get(userId: string, id: string) {
    const [m] = await query(
      this.db,
      `SELECT id,mime,size,status,storage_key FROM media_assets WHERE id=$1 AND owner_user_id=$2`,
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
