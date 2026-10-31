import { query } from '../database/query';
import {
  Inject,
  Injectable,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { randomUUID } from 'node:crypto';
import { environment } from '../../config/environment';
import { decrypt } from '../../common/crypto';
import { ApiError } from '../../common/http';
import { SocialService } from '../../modules/auth/social.service';
import { MediaService } from '../../modules/media/media.service';
import nodemailer from 'nodemailer';
@Injectable()
export class JobsService
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private timer?: NodeJS.Timeout;
  private running = false;
  constructor(
    @Inject(DataSource) private db: DataSource,
    @Inject(SocialService) private social: SocialService,
    @Inject(MediaService) private media: MediaService,
  ) {}
  onApplicationBootstrap() {
    if (environment().NODE_ENV !== 'test') {
      let ticks = 0;
      this.timer = setInterval(() => {
        void this.tick();
        if (++ticks % 720 === 0) void this.cleanup().catch(() => undefined);
      }, 5000).unref();
    }
  }
  onApplicationShutdown() {
    if (this.timer) clearInterval(this.timer);
  }
  async tick() {
    if (this.running) return;
    this.running = true;
    try {
      await this.processOne();
    } catch {
      /* No raw error, request body or provider payload logging. Durable job records contain codes only. */
    } finally {
      this.running = false;
    }
  }
  async processOne() {
    const lease = randomUUID();
    const [job] = await query(
      this.db,
      `UPDATE jobs SET lease_token=$1,lease_expires_at=now()+interval '60 seconds',attempts=attempts+1 WHERE id=(SELECT id FROM jobs WHERE completed_at IS NULL AND available_at<=now() AND (lease_expires_at IS NULL OR lease_expires_at<now()) AND (kind<>'MAIL' OR ($2 IN ('smtp','resend') AND payload->>'deliveryMode'=$2)) ORDER BY available_at,id FOR UPDATE SKIP LOCKED LIMIT 1) RETURNING *`,
      [lease, environment().MAIL_MODE],
    );
    if (!job) return false;
    try {
      if (job.kind === 'MAIL') await this.deliver(job);
      else await this.erase(job, lease);
      await query(
        this.db,
        `UPDATE jobs SET completed_at=now(),payload='{}',lease_token=NULL,lease_expires_at=NULL,last_error_code=NULL WHERE id=$1 AND lease_token=$2`,
        [job.id, lease],
      );
    } catch (error) {
      const code =
        error instanceof ApiError ? error.code : 'EXTERNAL_OPERATION_FAILED';
      await query(
        this.db,
        `UPDATE jobs SET last_error_code=$3,available_at=now()+($4*interval '1 second'),lease_token=NULL,lease_expires_at=NULL WHERE id=$1 AND lease_token=$2`,
        [
          job.id,
          lease,
          code,
          Math.min(3600, 30 * 2 ** Math.min(job.attempts, 7)),
        ],
      );
    }
    return true;
  }
  async deliver(job: any) {
    const e = environment();
    if (e.MAIL_MODE !== 'resend' && e.MAIL_MODE !== 'smtp')
      throw new ApiError('EMAIL_NOT_CONFIGURED', 503);
    const mail = JSON.parse(
      decrypt(job.payload.encrypted, e.MAIL_ENCRYPTION_KEY),
    );
    if (e.MAIL_MODE === 'smtp') {
      const transport = nodemailer.createTransport({
        host: e.SMTP_HOST,
        port: e.SMTP_PORT,
        secure: e.SMTP_PORT === 465,
        requireTLS: true,
        auth: { user: e.SMTP_USER, pass: e.SMTP_PASSWORD },
        connectionTimeout: 10000,
        greetingTimeout: 10000,
        socketTimeout: 15000,
        logger: false,
        debug: false,
      });
      await transport.sendMail({
        from: e.MAIL_FROM,
        to: mail.to,
        subject: mail.subject,
        text: mail.text,
        messageId: `<${job.id}@motion-api.local>`,
      });
      return;
    }
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${e.RESEND_API_KEY}`,
        'content-type': 'application/json',
        'idempotency-key': job.id,
      },
      body: JSON.stringify({
        from: e.MAIL_FROM,
        to: [mail.to],
        subject: mail.subject,
        text: mail.text,
      }),
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) throw new ApiError('EMAIL_DELIVERY_FAILED', 503);
  }
  async erase(job: any, lease: string) {
    if (environment().DELETION_RETENTION_APPROVED !== 'true')
      throw new ApiError('DELETION_RETENTION_POLICY_NOT_APPROVED', 503);
    const identities = await query(
      this.db,
      `SELECT provider_refresh_token_encrypted FROM auth_identities WHERE user_id=$1 AND provider='APPLE'`,
      [job.user_id],
    );
    let providerWarning = false;
    for (const i of identities)
      if (i.provider_refresh_token_encrypted) {
        try {
          await this.social.revokeApple(i.provider_refresh_token_encrypted);
        } catch {
          if (job.attempts < 5)
            throw new ApiError('APPLE_REVOCATION_RETRY', 503);
          providerWarning = true;
        }
      }
    const assets = await query(
      this.db,
      `SELECT storage_key,upload_key FROM media_assets WHERE owner_user_id=$1`,
      [job.user_id],
    );
    for (const a of assets) {
      await this.media.erase(a.storage_key);
      if (a.upload_key !== a.storage_key) await this.media.erase(a.upload_key);
    }
    await this.db.transaction(async (m) => {
      const [current] = await query(
        m,
        `SELECT id FROM jobs WHERE id=$1 AND lease_token=$2 AND lease_expires_at>now() FOR UPDATE`,
        [job.id, lease],
      );
      if (!current) throw new ApiError('JOB_LEASE_LOST', 409);
      await query(m, `SELECT id FROM users WHERE id=$1 FOR UPDATE`, [
        job.user_id,
      ]);
      await query(
        m,
        `UPDATE account_deletions SET status=$2,completed_at=now() WHERE user_id=$1`,
        [
          job.user_id,
          providerWarning
            ? 'DATA_DELETED_PROVIDER_REVOCATION_FAILED'
            : 'COMPLETED',
        ],
      );
      await query(
        m,
        `DELETE FROM users WHERE id=$1 AND status='DELETION_PENDING'`,
        [job.user_id],
      );
    });
  }
  async cleanup() {
    await query(
      this.db,
      `DELETE FROM rate_limits WHERE expires_at<now(); DELETE FROM idempotency_keys WHERE created_at<now()-interval '7 days'; DELETE FROM auth_challenges WHERE expires_at<now()-interval '1 day'; DELETE FROM verification_tokens WHERE expires_at<now()-interval '1 day'; DELETE FROM auth_refresh_tokens WHERE expires_at<now(); DELETE FROM auth_sessions WHERE expires_at<now(); DELETE FROM jobs WHERE completed_at<now()-interval '7 days'; DELETE FROM account_deletions WHERE expires_at<now();`,
    );
  }
}
