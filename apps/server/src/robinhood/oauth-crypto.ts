import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from 'node:crypto';

export type OAuthRecordKind = 'client_information' | 'tokens';

export interface OAuthEncryptionContext {
  ownerId: string;
  provider: 'robinhood';
  recordKind: OAuthRecordKind;
}

export class OAuthCredentialError extends Error {
  constructor(readonly code: 'oauth_credentials_invalid') {
    super(code);
    this.name = 'OAuthCredentialError';
  }
}

function additionalAuthenticatedData(context: OAuthEncryptionContext): Buffer {
  return Buffer.from(
    `aurum:robinhood:oauth:v1\0${context.ownerId}\0${context.provider}\0${context.recordKind}`,
    'utf8',
  );
}

export class AesGcmOAuthCrypto {
  private readonly key: Buffer;

  constructor(keyBase64: string) {
    this.key = Buffer.from(keyBase64, 'base64');
    if (this.key.length !== 32) {
      throw new OAuthCredentialError('oauth_credentials_invalid');
    }
  }

  seal(context: OAuthEncryptionContext, value: Record<string, unknown>): string {
    const nonce = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, nonce);
    cipher.setAAD(additionalAuthenticatedData(context));
    const ciphertext = Buffer.concat([
      cipher.update(JSON.stringify(value), 'utf8'),
      cipher.final(),
    ]);
    return [
      'v1',
      nonce.toString('base64url'),
      ciphertext.toString('base64url'),
      cipher.getAuthTag().toString('base64url'),
    ].join('.');
  }

  open(context: OAuthEncryptionContext, envelope: string): Record<string, unknown> {
    try {
      const [version, noncePart, ciphertextPart, tagPart, extra] = envelope.split('.');
      if (version !== 'v1' || !noncePart || !ciphertextPart || !tagPart || extra) {
        throw new Error('invalid envelope');
      }
      const nonce = Buffer.from(noncePart, 'base64url');
      const ciphertext = Buffer.from(ciphertextPart, 'base64url');
      const tag = Buffer.from(tagPart, 'base64url');
      if (nonce.length !== 12 || tag.length !== 16 || ciphertext.length === 0) {
        throw new Error('invalid envelope');
      }
      const decipher = createDecipheriv('aes-256-gcm', this.key, nonce);
      decipher.setAAD(additionalAuthenticatedData(context));
      decipher.setAuthTag(tag);
      const parsed: unknown = JSON.parse(
        Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8'),
      );
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error('invalid payload');
      }
      return parsed as Record<string, unknown>;
    } catch {
      throw new OAuthCredentialError('oauth_credentials_invalid');
    }
  }
}
