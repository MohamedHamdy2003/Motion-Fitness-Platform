import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';
export const randomToken = () => randomBytes(32).toString('base64url');
export const hash = (v: string) => createHash('sha256').update(v).digest('hex');
export function encrypt(v: string, key: string) {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', Buffer.from(key, 'hex'), iv);
  return Buffer.concat([
    iv,
    c.update(v, 'utf8'),
    c.final(),
    c.getAuthTag(),
  ]).toString('base64');
}
export function decrypt(v: string, key: string) {
  const b = Buffer.from(v, 'base64');
  const c = createDecipheriv(
    'aes-256-gcm',
    Buffer.from(key, 'hex'),
    b.subarray(0, 12),
  );
  c.setAuthTag(b.subarray(-16));
  return Buffer.concat([c.update(b.subarray(12, -16)), c.final()]).toString(
    'utf8',
  );
}
export function equal(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
