import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

export function createCsrfToken(sessionId: string, secret: string): string {
  if (secret.length < 32) throw new TypeError('CSRF secret must be at least 32 characters');
  const nonce = randomBytes(24).toString('base64url');
  const signature = createHmac('sha256', secret)
    .update(`${sessionId}.${nonce}`)
    .digest('base64url');
  return `${nonce}.${signature}`;
}

export function verifyCsrfToken(sessionId: string, token: string, secret: string): boolean {
  const [nonce, supplied] = token.split('.');
  if (!nonce || !supplied) return false;
  const expected = createHmac('sha256', secret)
    .update(`${sessionId}.${nonce}`)
    .digest('base64url');
  const expectedBytes = Buffer.from(expected);
  const suppliedBytes = Buffer.from(supplied);
  return (
    expectedBytes.byteLength === suppliedBytes.byteLength &&
    timingSafeEqual(expectedBytes, suppliedBytes)
  );
}
