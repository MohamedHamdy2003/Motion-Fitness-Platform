import { query } from '../database/query';
import { Inject, Injectable } from '@nestjs/common';
import { EntityManager, DataSource } from 'typeorm';
import { randomUUID } from 'node:crypto';
import { environment } from '../../config/environment';
import { ApiError } from '../../common/http';
import { encrypt } from '../../common/crypto';
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
    purpose: 'EMAIL_VERIFICATION' | 'PASSWORD_RESET',
    token: string,
  ) {
    this.assertConfigured();
    const env = environment();
    const payload = encrypt(
      JSON.stringify({
        to,
        subject:
          purpose === 'PASSWORD_RESET'
            ? 'Reset your Motion password'
            : 'Verify your Motion email',
        text: `Your Motion ${purpose === 'PASSWORD_RESET' ? 'password reset' : 'email verification'} code is: ${token}. It expires in 10 minutes. Do not share this code.`,
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
