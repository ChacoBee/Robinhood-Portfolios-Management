import { describe, expect, it } from 'vitest';
import {
  AesGcmOAuthCrypto,
  OAuthCredentialError,
} from '../../src/robinhood/oauth-crypto';

const encryptionKey = Buffer.alloc(32, 31).toString('base64');
const context = {
  ownerId: '00000000-0000-4000-8000-000000000301',
  provider: 'robinhood' as const,
  recordKind: 'tokens' as const,
};

describe('Robinhood OAuth credential encryption', () => {
  it('round-trips JSON only when the owner, provider, and record kind match', () => {
    const crypto = new AesGcmOAuthCrypto(encryptionKey);
    const payload = { tokenType: 'synthetic', expiresIn: 3600 };

    const envelope = crypto.seal(context, payload);

    expect(crypto.open(context, envelope)).toEqual(payload);
    expect(() => crypto.open({ ...context, recordKind: 'client_information' }, envelope))
      .toThrow(OAuthCredentialError);
    expect(() => crypto.open({ ...context, recordKind: 'client_information' }, envelope))
      .toThrow('oauth_credentials_invalid');
  });

  it('uses a fresh nonce for each envelope', () => {
    const crypto = new AesGcmOAuthCrypto(encryptionKey);
    const payload = { tokenType: 'synthetic', expiresIn: 3600 };

    expect(crypto.seal(context, payload)).not.toBe(crypto.seal(context, payload));
  });

  it('rejects tampered encrypted payloads with a safe error code', () => {
    const crypto = new AesGcmOAuthCrypto(encryptionKey);
    const envelope = crypto.seal(context, { tokenType: 'synthetic' });
    const tamperedIndex = envelope.length - 2;
    const tampered = `${envelope.slice(0, tamperedIndex)}${
      envelope[tamperedIndex] === 'A' ? 'B' : 'A'
    }${envelope.slice(tamperedIndex + 1)}`;

    expect(() => crypto.open(context, tampered)).toThrow(OAuthCredentialError);
    expect(() => crypto.open(context, tampered)).toThrow('oauth_credentials_invalid');
  });

  it.each([
    ['an appended non-base64url character', (envelope: string) => `${envelope}!`],
    ['a noncanonical padding suffix', (envelope: string) => `${envelope}=`],
  ])('rejects %s with a safe error code', (_caseName, mutate) => {
    const crypto = new AesGcmOAuthCrypto(encryptionKey);
    const envelope = crypto.seal(context, { tokenType: 'synthetic' });

    expect(() => crypto.open(context, mutate(envelope))).toThrow(
      'oauth_credentials_invalid',
    );
  });
});
