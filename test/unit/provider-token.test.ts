import { beforeAll, describe, it, expect } from 'vitest';
import {
  generateKeyPair,
  exportJWK,
  createLocalJWKSet,
  SignJWT,
  JWTVerifyGetKey,
} from 'jose';
import { verifyProviderToken } from '../../src/modules/auth/provider-token';
let key: CryptoKey;
let getKey: JWTVerifyGetKey;
beforeAll(async () => {
  const pair = await generateKeyPair('RS256');
  key = pair.privateKey;
  const publicKey = await exportJWK(pair.publicKey);
  getKey = createLocalJWKSet({
    keys: [{ ...publicKey, kid: 'fixture', alg: 'RS256' }],
  });
});
async function signed(
  issuer = 'https://accounts.google.com',
  audience = 'mobile-client',
  expiry = '5m',
  nonce: string | undefined = 'nonce',
  azp?: string,
) {
  return new SignJWT({ ...(nonce ? { nonce } : {}), ...(azp ? { azp } : {}) })
    .setProtectedHeader({ alg: 'RS256', kid: 'fixture' })
    .setIssuer(issuer)
    .setAudience(audience)
    .setSubject('subject-123')
    .setIssuedAt()
    .setExpirationTime(expiry)
    .sign(key);
}
describe('real provider JWT verification with fixture signing keys', () => {
  it('verifies Google and Apple issuer/audience/signature/expiry', async () => {
    expect(
      (
        await verifyProviderToken(await signed(), getKey, 'GOOGLE', [
          'mobile-client',
        ])
      ).sub,
    ).toBe('subject-123');
    expect(
      (
        await verifyProviderToken(
          await signed('https://appleid.apple.com'),
          getKey,
          'APPLE',
          ['mobile-client'],
        )
      ).sub,
    ).toBe('subject-123');
  });
  it('rejects wrong audience, issuer, expired, missing nonce and wrong authorized party', async () => {
    for (const value of [
      await signed(undefined, 'wrong-client'),
      await signed('https://forged.test'),
      await signed(undefined, undefined, '-1s'),
      await signed(undefined, undefined, undefined, ''),
      await signed(
        undefined,
        undefined,
        undefined,
        undefined,
        'unapproved-client',
      ),
    ])
      await expect(
        verifyProviderToken(value, getKey, 'GOOGLE', ['mobile-client']),
      ).rejects.toMatchObject({ code: 'INVALID_PROVIDER_TOKEN' });
  });
  it('rejects token signed by a different key', async () => {
    const other = await generateKeyPair('RS256');
    const token = await new SignJWT({ nonce: 'nonce' })
      .setProtectedHeader({ alg: 'RS256', kid: 'fixture' })
      .setIssuer('https://accounts.google.com')
      .setAudience('mobile-client')
      .setSubject('forged-subject')
      .setIssuedAt()
      .setExpirationTime('5m')
      .sign(other.privateKey);
    await expect(
      verifyProviderToken(token, getKey, 'GOOGLE', ['mobile-client']),
    ).rejects.toMatchObject({ code: 'INVALID_PROVIDER_TOKEN' });
  });
});
