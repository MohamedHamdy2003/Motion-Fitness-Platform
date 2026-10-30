import { query } from '../../infrastructure/database/query';
import { Inject, Injectable } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { createRemoteJWKSet, SignJWT, importPKCS8, JWTPayload } from 'jose';
import { randomUUID } from 'node:crypto';
import { environment } from '../../config/environment';
import { ApiError, Principal } from '../../common/http';
import { hash, randomToken, encrypt, decrypt } from '../../common/crypto';
import { AuthService } from './auth.service';
import { verifyProviderToken } from './provider-token';
export type Provider = 'GOOGLE' | 'APPLE';
export type SocialInput = {
  idToken: string;
  challengeId: string;
  authorizationCode?: string;
  name?: string;
};
const googleKeys = createRemoteJWKSet(
  new URL('https://www.googleapis.com/oauth2/v3/certs'),
);
const appleKeys = createRemoteJWKSet(
  new URL('https://appleid.apple.com/auth/keys'),
);
@Injectable()
export class SocialService {
  constructor(
    @Inject(DataSource) private db: DataSource,
    @Inject(AuthService) private auth: AuthService,
  ) {}
  configured(provider: Provider) {
    const env = environment();
    if (
      provider === 'GOOGLE'
        ? !env.GOOGLE_CLIENT_IDS
        : !env.APPLE_CLIENT_IDS ||
          !env.APPLE_TEAM_ID ||
          !env.APPLE_KEY_ID ||
          !env.APPLE_PRIVATE_KEY ||
          !env.APPLE_ENCRYPTION_KEY
    )
      throw new ApiError(`${provider}_NOT_CONFIGURED`, 503);
  }
  async challenge(
    provider: Provider,
    purpose: 'SIGN_IN' | 'LINK' | 'REAUTHENTICATE',
    userId?: string,
  ) {
    this.configured(provider);
    const id = randomUUID();
    const nonce = randomToken();
    await query(
      this.db,
      `INSERT INTO auth_challenges(id,user_id,provider,purpose,nonce_hash,expires_at) VALUES($1,$2,$3,$4,$5,now()+interval '5 minutes')`,
      [id, userId || null, provider, purpose, hash(nonce)],
    );
    return { challengeId: id, nonce, expiresIn: 300 };
  }
  async verify(provider: Provider, idToken: string): Promise<JWTPayload> {
    this.configured(provider);
    const env = environment();
    return verifyProviderToken(
      idToken,
      provider === 'GOOGLE' ? googleKeys : appleKeys,
      provider,
      (provider === 'GOOGLE' ? env.GOOGLE_CLIENT_IDS : env.APPLE_CLIENT_IDS)
        .split(',')
        .map((v) => v.trim()),
    );
  }
  async clientSecret(clientId: string) {
    const e = environment();
    const key = await importPKCS8(
      e.APPLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
      'ES256',
    );
    return new SignJWT({})
      .setProtectedHeader({ alg: 'ES256', kid: e.APPLE_KEY_ID })
      .setIssuer(e.APPLE_TEAM_ID)
      .setSubject(clientId)
      .setAudience('https://appleid.apple.com')
      .setIssuedAt()
      .setExpirationTime('5m')
      .sign(key);
  }
  async exchangeApple(code: string, payload: JWTPayload) {
    const clientId = String(payload.aud);
    const response = await fetch('https://appleid.apple.com/auth/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: await this.clientSecret(clientId),
        code,
        grant_type: 'authorization_code',
      }),
      signal: AbortSignal.timeout(10000),
    }).catch(() => {
      throw new ApiError('PROVIDER_UNAVAILABLE', 503);
    });
    if (!response.ok) throw new ApiError('APPLE_CODE_EXCHANGE_FAILED', 401);
    const data = (await response.json()) as {
      id_token?: string;
      refresh_token?: string;
    };
    if (!data.id_token || !data.refresh_token)
      throw new ApiError('APPLE_CODE_EXCHANGE_FAILED', 401);
    const checked = await this.verify('APPLE', data.id_token);
    if (checked.sub !== payload.sub || checked.nonce !== payload.nonce)
      throw new ApiError('INVALID_PROVIDER_TOKEN', 401);
    return encrypt(
      JSON.stringify({ token: data.refresh_token, clientId }),
      environment().APPLE_ENCRYPTION_KEY,
    );
  }
  async consumeChallenge(
    m: EntityManager,
    provider: Provider,
    input: SocialInput,
    claims: JWTPayload,
    purpose: string,
    userId?: string,
  ) {
    const [c] = await query(
      m,
      `UPDATE auth_challenges SET consumed_at=now() WHERE id=$1 AND provider=$2 AND purpose=$3 AND nonce_hash=$4 AND user_id IS NOT DISTINCT FROM $5 AND consumed_at IS NULL AND expires_at>now() RETURNING id`,
      [
        input.challengeId,
        provider,
        purpose,
        hash(String(claims.nonce)),
        userId || null,
      ],
    );
    if (!c) throw new ApiError('INVALID_OR_REUSED_CHALLENGE', 401);
  }
  async signIn(provider: Provider, input: SocialInput) {
    const claims = await this.verify(provider, input.idToken);
    const appleToken =
      provider === 'APPLE'
        ? await this.exchangeApple(input.authorizationCode || '', claims)
        : null;
    return this.db.transaction(async (m) => {
      await this.consumeChallenge(m, provider, input, claims, 'SIGN_IN');
      await query(m, `SELECT pg_advisory_xact_lock(hashtextextended($1,0))`, [
        provider + ':' + claims.sub,
      ]);
      const [identity] = await query(
        m,
        `SELECT * FROM auth_identities WHERE provider=$1 AND provider_subject=$2`,
        [provider, claims.sub],
      );
      let userId = identity?.user_id;
      if (userId) {
        const [u] = await query(
          m,
          `SELECT * FROM users WHERE id=$1 FOR UPDATE`,
          [userId],
        );
        if (u.status !== 'ACTIVE')
          throw new ApiError('ACCOUNT_UNAVAILABLE', 403);
        if (appleToken)
          await query(
            m,
            `UPDATE auth_identities SET provider_refresh_token_encrypted=$2 WHERE id=$1`,
            [identity.id, appleToken],
          );
      } else {
        const email =
          typeof claims.email === 'string' ? claims.email.toLowerCase() : null;
        const [collision] = email
          ? await query(m, `SELECT id FROM users WHERE email_normalized=$1`, [
              email,
            ])
          : [];
        if (collision) throw new ApiError('ACCOUNT_LINK_REQUIRED', 409);
        userId = randomUUID();
        const trusted =
          claims.email_verified === true || claims.email_verified === 'true';
        await query(
          m,
          `INSERT INTO users(id,email_normalized,verified_at) VALUES($1,$2,$3)`,
          [userId, email, trusted ? new Date() : null],
        );
        await this.auth.initializeUser(m, userId);
        await query(
          m,
          `INSERT INTO auth_identities(id,user_id,provider,provider_subject,provider_email,provider_refresh_token_encrypted) VALUES($1,$2,$3,$4,$5,$6)`,
          [randomUUID(), userId, provider, claims.sub, email, appleToken],
        );
        if (input.name)
          await query(m, `UPDATE user_profiles SET name=$2 WHERE user_id=$1`, [
            userId,
            input.name,
          ]);
      }
      return this.auth.session(m, userId);
    });
  }
  async link(
    p: Principal,
    provider: Provider,
    input: SocialInput,
    proof: string,
  ) {
    const claims = await this.verify(provider, input.idToken);
    const appleToken =
      provider === 'APPLE'
        ? await this.exchangeApple(input.authorizationCode || '', claims)
        : null;
    await this.db.transaction(async (m) => {
      await query(m, `SELECT id FROM users WHERE id=$1 FOR UPDATE`, [p.userId]);
      await this.auth.consumeProof(m, p, proof, 'LINK');
      await this.consumeChallenge(m, provider, input, claims, 'LINK', p.userId);
      await query(
        m,
        `INSERT INTO auth_identities(id,user_id,provider,provider_subject,provider_email,provider_refresh_token_encrypted) VALUES($1,$2,$3,$4,$5,$6)`,
        [
          randomUUID(),
          p.userId,
          provider,
          claims.sub,
          typeof claims.email === 'string' ? claims.email : null,
          appleToken,
        ],
      );
    });
    return { status: 'LINKED', provider };
  }
  async reauthenticate(
    p: Principal,
    provider: Provider,
    input: SocialInput,
    purpose: 'LINK' | 'DELETE',
  ) {
    const claims = await this.verify(provider, input.idToken);
    const appleToken =
      provider === 'APPLE'
        ? await this.exchangeApple(input.authorizationCode || '', claims)
        : null;
    return this.db.transaction(async (m) => {
      await query(m, `SELECT id FROM users WHERE id=$1 FOR UPDATE`, [p.userId]);
      await this.consumeChallenge(
        m,
        provider,
        input,
        claims,
        'REAUTHENTICATE',
        p.userId,
      );
      const [identity] = await query(
        m,
        `SELECT id FROM auth_identities WHERE user_id=$1 AND provider=$2 AND provider_subject=$3`,
        [p.userId, provider, claims.sub],
      );
      if (!identity) throw new ApiError('IDENTITY_NOT_LINKED', 403);
      if (appleToken)
        await query(
          m,
          `UPDATE auth_identities SET provider_refresh_token_encrypted=$2 WHERE id=$1`,
          [identity.id, appleToken],
        );
      return this.auth.proof(m, p, purpose);
    });
  }
  async revokeApple(encrypted: string) {
    const { token, clientId } = JSON.parse(
      decrypt(encrypted, environment().APPLE_ENCRYPTION_KEY),
    );
    const response = await fetch('https://appleid.apple.com/auth/revoke', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: await this.clientSecret(clientId),
        token,
        token_type_hint: 'refresh_token',
      }),
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) throw new ApiError('APPLE_REVOCATION_FAILED', 503);
  }
}
