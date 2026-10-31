import { query } from '../../infrastructure/database/query';
import { Inject, Injectable } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { randomUUID, randomInt, createHmac } from 'node:crypto';
import * as argon2 from 'argon2';
import jwt from 'jsonwebtoken';
import { ApiError, Principal } from '../../common/http';
import { hash, randomToken } from '../../common/crypto';
import { environment } from '../../config/environment';
import { MailService } from '../../infrastructure/mail/mail.service';
import { User, UserSchema } from './user.entity';

@Injectable()
export class AuthService {
  constructor(
    @Inject(DataSource) public db: DataSource,
    @Inject(MailService) private mail: MailService,
  ) {}
  async initializeUser(m: EntityManager, userId: string) {
    for (const table of [
      'user_profiles',
      'user_settings',
      'user_restriction_states',
      'user_food_preferences',
    ])
      await query(m, `INSERT INTO ${table}(user_id) VALUES($1)`, [userId]);
    await query(
      m,
      `INSERT INTO user_roles(user_id,role_code) VALUES($1,'ATHLETE')`,
      [userId],
    );
  }
  async session(m: EntityManager, userId: string) {
    const id = randomUUID();
    await query(
      m,
      `INSERT INTO auth_sessions(id,user_id,family_id,expires_at) VALUES($1,$2,$3,now()+interval '30 days')`,
      [id, userId, randomUUID()],
    );
    return this.issue(m, userId, id);
  }
  async issue(
    m: EntityManager,
    userId: string,
    sid: string,
    parentId?: string,
  ) {
    const refreshToken = randomToken();
    await query(
      m,
      `INSERT INTO auth_refresh_tokens(id,session_id,token_hash,parent_token_id,expires_at) SELECT $1,id,$2,$3,expires_at FROM auth_sessions WHERE id=$4`,
      [randomUUID(), hash(refreshToken), parentId || null, sid],
    );
    const env = environment();
    const accessToken = jwt.sign({ sid }, env.JWT_SECRET, {
      algorithm: 'HS256',
      subject: userId,
      issuer: env.JWT_ISSUER,
      audience: env.JWT_AUDIENCE,
      expiresIn: 900,
    });
    return { accessToken, refreshToken, tokenType: 'Bearer', expiresIn: 900 };
  }
  async verification(
    m: EntityManager,
    user: User,
    purpose: 'EMAIL_VERIFICATION' | 'PASSWORD_RESET',
  ) {
    const value = String(randomInt(0, 1000000)).padStart(6, '0');
    const [recent] = await query(
      m,
      `SELECT id FROM verification_tokens WHERE user_id=$1 AND purpose=$2 AND is_otp AND expires_at>now()+interval '9 minutes' LIMIT 1`,
      [user.id, purpose],
    );
    if (recent) return;
    await query(
      m,
      `UPDATE verification_tokens SET consumed_at=now() WHERE user_id=$1 AND purpose=$2 AND consumed_at IS NULL`,
      [user.id, purpose],
    );
    await query(
      m,
      `INSERT INTO verification_tokens(id,user_id,purpose,token_hash,expires_at,is_otp) VALUES($1,$2,$3,$4,now()+interval '10 minutes',true)`,
      [randomUUID(), user.id, purpose, this.otpHash(user.id, purpose, value)],
    );
    await this.mail.enqueue(m, user.id, user.email_normalized!, purpose, value);
  }
  async register(email: string, password: string) {
    this.mail.assertConfigured();
    const encoded = await argon2.hash(password);
    return this.db.transaction(async (m) => {
      const id = randomUUID();
      const [user] = await query(
        m,
        `INSERT INTO users(id,email_normalized,password_hash) VALUES($1,$2,$3) RETURNING *`,
        [id, email, encoded],
      );
      await this.initializeUser(m, id);
      await this.verification(m, user, 'EMAIL_VERIFICATION');
      return {
        ...(await this.session(m, id)),
        user: { id, email, verified: false },
        emailDelivery: 'QUEUED',
      };
    });
  }
  async login(email: string, password: string) {
    const candidate = await this.db
      .getRepository(UserSchema)
      .findOneBy({ email_normalized: email });
    // Perform a real KDF for unknown accounts too, reducing account-existence timing differences.
    const valid = candidate?.password_hash
      ? await argon2.verify(candidate.password_hash, password)
      : await argon2.verify(
          await argon2.hash('unavailable-account-password'),
          password,
        );
    if (!valid || !candidate || candidate.status !== 'ACTIVE')
      throw new ApiError('INVALID_CREDENTIALS', 401);
    return this.db.transaction(async (m) => {
      const [user] = await query(
        m,
        `SELECT * FROM users WHERE id=$1 FOR UPDATE`,
        [candidate.id],
      );
      if (
        user.status !== 'ACTIVE' ||
        user.password_hash !== candidate.password_hash
      )
        throw new ApiError('INVALID_CREDENTIALS', 401);
      return this.session(m, user.id);
    });
  }
  async refresh(value: string) {
    const result = await this.db.transaction(async (m) => {
      const [candidate] = await query(
        m,
        `SELECT session_id FROM auth_refresh_tokens WHERE token_hash=$1`,
        [hash(value)],
      );
      if (!candidate) return null;
      const [s] = await query(
        m,
        `SELECT s.*,u.status FROM auth_sessions s JOIN users u ON u.id=s.user_id WHERE s.id=$1 FOR UPDATE OF s`,
        [candidate.session_id],
      );
      const [t] = await query(
        m,
        `SELECT * FROM auth_refresh_tokens WHERE token_hash=$1 FOR UPDATE`,
        [hash(value)],
      );
      if (t.consumed_at) {
        await query(
          m,
          `UPDATE auth_sessions SET revoked_at=now() WHERE family_id=$1`,
          [s.family_id],
        );
        await query(
          m,
          `UPDATE auth_refresh_tokens SET revoked_at=now() WHERE session_id IN (SELECT id FROM auth_sessions WHERE family_id=$1)`,
          [s.family_id],
        );
        return null;
      }
      if (
        t.revoked_at ||
        s.revoked_at ||
        new Date(t.expires_at) <= new Date() ||
        new Date(s.expires_at) <= new Date() ||
        s.status !== 'ACTIVE'
      )
        return null;
      await query(
        m,
        `UPDATE auth_refresh_tokens SET consumed_at=now() WHERE id=$1`,
        [t.id],
      );
      return this.issue(m, s.user_id, s.id, t.id);
    });
    if (!result) throw new ApiError('INVALID_REFRESH_TOKEN', 401);
    return result;
  }
  async revoke(m: EntityManager, userId: string, sessionId?: string) {
    await query(m, `SELECT id FROM users WHERE id=$1 FOR UPDATE`, [userId]);
    await query(
      m,
      `UPDATE auth_sessions SET revoked_at=now() WHERE user_id=$1 ${sessionId ? 'AND id=$2' : ''}`,
      [userId, ...(sessionId ? [sessionId] : [])],
    );
    await query(
      m,
      `UPDATE auth_refresh_tokens SET revoked_at=now() WHERE session_id IN (SELECT id FROM auth_sessions WHERE user_id=$1 ${sessionId ? 'AND id=$2' : ''})`,
      [userId, ...(sessionId ? [sessionId] : [])],
    );
  }
  async logout(p: Principal, all = false) {
    await this.db.transaction((m) =>
      this.revoke(m, p.userId, all ? undefined : p.sessionId),
    );
    return { status: 'LOGGED_OUT' };
  }
  async emailRequest(
    email: string,
    purpose: 'EMAIL_VERIFICATION' | 'PASSWORD_RESET',
  ) {
    this.mail.assertConfigured();
    await this.db.transaction(async (m) => {
      const [u] = await query(
        m,
        `SELECT * FROM users WHERE email_normalized=$1 AND status='ACTIVE' FOR UPDATE`,
        [email],
      );
      if (
        u &&
        (purpose === 'EMAIL_VERIFICATION' ? !u.verified_at : !!u.password_hash)
      )
        await this.verification(m, u, purpose);
    });
    return {
      status: 'ACCEPTED',
      message: 'If the account is eligible, an email will be sent.',
    };
  }
  otpHash(userId: string, purpose: string, value: string) {
    return createHmac('sha256', environment().MAIL_ENCRYPTION_KEY)
      .update(`${userId}:${purpose}:${value}`)
      .digest('hex');
  }
  async verifyOtp(
    email: string,
    value: string,
    purpose: 'EMAIL_VERIFICATION' | 'PASSWORD_RESET',
  ) {
    const result = await this.db.transaction(async (m) => {
      const [u] = await query(
        m,
        `SELECT * FROM users WHERE email_normalized=$1 AND status='ACTIVE' FOR UPDATE`,
        [email],
      );
      if (!u || (purpose === 'PASSWORD_RESET' && !u.password_hash)) return null;
      const [t] = await query(
        m,
        `SELECT * FROM verification_tokens WHERE user_id=$1 AND purpose=$2 AND is_otp AND consumed_at IS NULL AND expires_at>now() ORDER BY expires_at DESC LIMIT 1 FOR UPDATE`,
        [u.id, purpose],
      );
      if (!t || t.attempts >= 5) return null;
      const valid = t.token_hash === this.otpHash(u.id, purpose, value);
      await query(
        m,
        `UPDATE verification_tokens SET attempts=attempts+1,consumed_at=CASE WHEN $2 OR attempts>=4 THEN now() ELSE consumed_at END WHERE id=$1`,
        [t.id, valid],
      );
      if (!valid) return null;
      if (purpose === 'EMAIL_VERIFICATION') {
        await query(m, `UPDATE users SET verified_at=now() WHERE id=$1`, [
          u.id,
        ]);
        return { status: 'VERIFIED' };
      }
      const resetToken = randomToken();
      await query(
        m,
        `INSERT INTO verification_tokens(id,user_id,purpose,token_hash,expires_at) VALUES($1,$2,'PASSWORD_RESET',$3,now()+interval '5 minutes')`,
        [randomUUID(), u.id, hash(resetToken)],
      );
      return { status: 'OTP_VERIFIED', resetToken, expiresIn: 300 };
    });
    if (!result) throw new ApiError('INVALID_OR_EXPIRED_OTP');
    return result;
  }
  async verifyEmail(email: string, code: string) {
    return this.verifyOtp(email, code, 'EMAIL_VERIFICATION');
  }
  async resetPassword(value: string, newPassword: string) {
    const encoded = await argon2.hash(newPassword);
    await this.db.transaction(async (m) => {
      const [candidate] = await query(
        m,
        `SELECT user_id FROM verification_tokens WHERE token_hash=$1 AND purpose='PASSWORD_RESET' AND NOT is_otp`,
        [hash(value)],
      );
      if (!candidate) throw new ApiError('INVALID_RESET_TOKEN');
      const [u] = await query(m, `SELECT * FROM users WHERE id=$1 FOR UPDATE`, [
        candidate.user_id,
      ]);
      const [t] = await query(
        m,
        `UPDATE verification_tokens SET consumed_at=now() WHERE token_hash=$1 AND purpose='PASSWORD_RESET' AND NOT is_otp AND consumed_at IS NULL AND expires_at>now() RETURNING user_id`,
        [hash(value)],
      );
      if (!t || !u.password_hash || u.status !== 'ACTIVE')
        throw new ApiError('INVALID_RESET_TOKEN');
      await this.replacePassword(m, u.id, encoded);
    });
    return { status: 'PASSWORD_CHANGED', requiresLogin: true };
  }
  async replacePassword(m: EntityManager, id: string, encoded: string) {
    await query(m, `UPDATE users SET password_hash=$2 WHERE id=$1`, [
      id,
      encoded,
    ]);
    await query(
      m,
      `UPDATE verification_tokens SET consumed_at=now() WHERE user_id=$1 AND consumed_at IS NULL`,
      [id],
    );
    await this.revoke(m, id);
  }
  async changePassword(p: Principal, current: string, next: string) {
    const encoded = await argon2.hash(next);
    await this.db.transaction(async (m) => {
      const [u] = await query(m, `SELECT * FROM users WHERE id=$1 FOR UPDATE`, [
        p.userId,
      ]);
      await this.activeSession(m, p);
      if (!u.password_hash) throw new ApiError('PASSWORD_LOGIN_NOT_ENABLED');
      if (!(await argon2.verify(u.password_hash, current)))
        throw new ApiError('INVALID_CREDENTIALS', 401);
      await this.replacePassword(m, p.userId, encoded);
    });
    return { status: 'PASSWORD_CHANGED', requiresLogin: true };
  }
  async passwordReauth(
    p: Principal,
    password: string,
    purpose: 'LINK' | 'DELETE',
  ) {
    return this.db.transaction(async (m) => {
      const [u] = await query(
        m,
        `SELECT * FROM users WHERE id=$1 AND status='ACTIVE' FOR UPDATE`,
        [p.userId],
      );
      if (!u?.password_hash) throw new ApiError('PASSWORD_LOGIN_NOT_ENABLED');
      if (!(await argon2.verify(u.password_hash, password)))
        throw new ApiError('INVALID_CREDENTIALS', 401);
      return this.proof(m, p, purpose);
    });
  }
  async proof(m: EntityManager, p: Principal, purpose: 'LINK' | 'DELETE') {
    await this.activeSession(m, p);
    const value = randomToken();
    await query(
      m,
      `INSERT INTO verification_tokens(id,user_id,purpose,token_hash,session_id,expires_at) VALUES($1,$2,$3,$4,$5,now()+interval '5 minutes')`,
      [
        randomUUID(),
        p.userId,
        purpose === 'LINK' ? 'REAUTH_LINK' : 'REAUTH_DELETE',
        hash(value),
        p.sessionId,
      ],
    );
    return { reauthenticationToken: value, expiresIn: 300, purpose };
  }
  async consumeProof(
    m: EntityManager,
    p: Principal,
    value: string,
    purpose: 'LINK' | 'DELETE',
  ) {
    await this.activeSession(m, p);
    const [t] = await query(
      m,
      `UPDATE verification_tokens SET consumed_at=now() WHERE user_id=$1 AND session_id=$2 AND token_hash=$3 AND purpose=$4 AND consumed_at IS NULL AND expires_at>now() RETURNING id`,
      [
        p.userId,
        p.sessionId,
        hash(value),
        purpose === 'LINK' ? 'REAUTH_LINK' : 'REAUTH_DELETE',
      ],
    );
    if (!t) throw new ApiError('FRESH_REAUTHENTICATION_REQUIRED', 403);
  }
  async activeSession(m: EntityManager, p: Principal) {
    const [s] = await query(
      m,
      `SELECT s.id FROM auth_sessions s JOIN users u ON u.id=s.user_id WHERE s.id=$1 AND s.user_id=$2 AND s.revoked_at IS NULL AND s.expires_at>now() AND u.status='ACTIVE' FOR UPDATE OF s`,
      [p.sessionId, p.userId],
    );
    if (!s) throw new ApiError('SESSION_REVOKED', 401);
  }
  async deleteAccount(p: Principal, proof: string) {
    const trackingToken = randomToken();
    const id = randomUUID();
    await this.db.transaction(async (m) => {
      await query(m, `SELECT id FROM users WHERE id=$1 FOR UPDATE`, [p.userId]);
      await this.consumeProof(m, p, proof, 'DELETE');
      await query(m, `UPDATE users SET status='DELETION_PENDING' WHERE id=$1`, [
        p.userId,
      ]);
      await this.revoke(m, p.userId);
      await query(
        m,
        `INSERT INTO account_deletions(id,user_id,tracking_hash,expires_at) VALUES($1,$2,$3,now()+interval '30 days')`,
        [id, p.userId, hash(trackingToken)],
      );
      await query(
        m,
        `INSERT INTO jobs(id,kind,user_id) VALUES($1,'ACCOUNT_DELETION',$2)`,
        [randomUUID(), p.userId],
      );
    });
    return {
      status: 'PENDING',
      trackingToken,
      expiresIn: 2592000,
      subscriptionCancellation: 'NOT_INTEGRATED',
      message:
        'Deleting Motion data does not cancel App Store or Google Play subscriptions.',
    };
  }
  async deletionStatus(value: string) {
    const [r] = await query(
      this.db,
      `SELECT status,requested_at,completed_at FROM account_deletions WHERE tracking_hash=$1 AND expires_at>now()`,
      [hash(value)],
    );
    if (!r) throw new ApiError('NOT_FOUND', 404);
    return r;
  }
}
