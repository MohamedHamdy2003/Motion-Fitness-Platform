import { query } from '../database/query';
import { Inject, Injectable } from '@nestjs/common';
import { EntityManager, DataSource } from 'typeorm';
import { randomUUID } from 'node:crypto';
import { environment } from '../../config/environment';
import { ApiError } from '../../common/http';
import { encrypt } from '../../common/crypto';
import { OtpEmailPurpose, renderOtpEmail } from './otp-email.template';
@Injectable()
export class MailService {
  constructor(@Inject(DataSource) private db: DataSource) {}
  assertConfigured() {
    if (environment().MAIL_MODE === 'disabled')
      throw new ApiError('EMAIL_NOT_CONFIGURED', 503);
  }
  async enqueue(
    m: EntityManager,
    userId: string,
    to: string,
    purpose: OtpEmailPurpose,
    token: string,
  ) {
    this.assertConfigured();
    const env = environment();
    const rendered = renderOtpEmail(purpose, token);
    const payload = encrypt(
      JSON.stringify({
        to,
        subject: rendered.subject,
        text: rendered.text,
        html: rendered.html,
        logoCid: rendered.logoCid,
      }),
      env.MAIL_ENCRYPTION_KEY,
    );
    await query(
      m,
      `INSERT INTO jobs(id,kind,user_id,payload) VALUES($1,'MAIL',$2,$3)`,
      [
        randomUUID(),
        userId,
        JSON.stringify({ encrypted: payload, deliveryMode: env.MAIL_MODE }),
      ],
    );
  }
}
