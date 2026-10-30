import { jwtVerify, JWTVerifyGetKey, JWTPayload } from 'jose';
import { ApiError } from '../../common/http';
export async function verifyProviderToken(
  idToken: string,
  key: JWTVerifyGetKey,
  provider: 'GOOGLE' | 'APPLE',
  audiences: string[],
): Promise<JWTPayload> {
  try {
    const { payload } = await jwtVerify(idToken, key, {
      algorithms: ['RS256'],
      issuer:
        provider === 'GOOGLE'
          ? ['https://accounts.google.com', 'accounts.google.com']
          : 'https://appleid.apple.com',
      audience: audiences,
      requiredClaims: ['sub', 'exp', 'iat', 'nonce'],
    });
    if (
      !payload.sub ||
      typeof payload.nonce !== 'string' ||
      (provider === 'GOOGLE' &&
        payload.azp !== undefined &&
        !audiences.includes(String(payload.azp)))
    )
      throw Error();
    return payload;
  } catch {
    throw new ApiError('INVALID_PROVIDER_TOKEN', 401);
  }
}
