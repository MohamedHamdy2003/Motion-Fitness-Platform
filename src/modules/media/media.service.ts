import { query } from '../../infrastructure/database/query';
import { Inject, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import {
  S3Client,
  PutObjectCommand,
  HeadObjectCommand,
  DeleteObjectCommand,
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
    const key = `avatars/${id}/${mediaId}`;
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
      `INSERT INTO media_assets(id,owner_user_id,storage_key,mime,size,status) VALUES($1,$2,$3,$4,$5,'PENDING')`,
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
    let result;
    try {
      result = await client.send(
        new HeadObjectCommand({
          Bucket: environment().S3_BUCKET,
          Key: media.storage_key,
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
          Key: media.storage_key,
        }),
      );
      throw new ApiError('UPLOAD_METADATA_MISMATCH', 422);
    }
    await query(this.db, `UPDATE media_assets SET status='READY' WHERE id=$1`, [
      id,
    ]);
    return { id, status: 'READY' };
  }
  async get(userId: string, id: string) {
    const [m] = await query(
      this.db,
      `SELECT id,mime,size,status FROM media_assets WHERE id=$1 AND owner_user_id=$2`,
      [id, userId],
    );
    if (!m) throw new ApiError('NOT_FOUND', 404);
    return m;
  }
  async erase(key: string) {
    await this.client().send(
      new DeleteObjectCommand({ Bucket: environment().S3_BUCKET, Key: key }),
    );
  }
}
