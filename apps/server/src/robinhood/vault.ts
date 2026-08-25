import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
} from 'node:crypto';
import { ProviderBoundaryError } from './errors';

declare const encryptedAccountReferenceBrand: unique symbol;
declare const stableAccountKeyBrand: unique symbol;
declare const stableProviderKeyBrand: unique symbol;

export type EncryptedAccountReference = string & {
  readonly [encryptedAccountReferenceBrand]: true;
};

export type StableAccountKey = string & {
  readonly [stableAccountKeyBrand]: true;
};

export type ProviderIdentifierKind = 'instrument' | 'option';

export type StableProviderKey = string & {
  readonly [stableProviderKeyBrand]: true;
};

export interface AccountReferenceVault {
  seal(rawReference: string): EncryptedAccountReference;
  open(reference: EncryptedAccountReference): string;
  stableKey(rawReference: string): StableAccountKey;
  stableProviderKey(
    kind: ProviderIdentifierKind,
    rawIdentifier: string,
  ): StableProviderKey;
}

/** AES-256-GCM keeps provider identifiers recoverable only inside the adapter. */
export class AesGcmAccountReferenceVault implements AccountReferenceVault {
  private readonly key: Buffer;

  constructor(keyBase64: string) {
    this.key = Buffer.from(keyBase64, 'base64');
    if (this.key.length !== 32) {
      throw new ProviderBoundaryError('provider_reference_invalid');
    }
  }

  seal(rawReference: string): EncryptedAccountReference {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const ciphertext = Buffer.concat([
      cipher.update(rawReference, 'utf8'),
      cipher.final(),
    ]);
    const tag = cipher.getAuthTag();
    return [
      'v1',
      iv.toString('base64url'),
      ciphertext.toString('base64url'),
      tag.toString('base64url'),
    ].join('.') as EncryptedAccountReference;
  }

  open(reference: EncryptedAccountReference): string {
    try {
      const [version, ivPart, ciphertextPart, tagPart, extra] = reference.split('.');
      if (version !== 'v1' || !ivPart || !ciphertextPart || !tagPart || extra) {
        throw new Error('invalid envelope');
      }
      const iv = Buffer.from(ivPart, 'base64url');
      const ciphertext = Buffer.from(ciphertextPart, 'base64url');
      const tag = Buffer.from(tagPart, 'base64url');
      if (iv.length !== 12 || tag.length !== 16 || ciphertext.length === 0) {
        throw new Error('invalid envelope');
      }
      const decipher = createDecipheriv('aes-256-gcm', this.key, iv);
      decipher.setAuthTag(tag);
      return Buffer.concat([
        decipher.update(ciphertext),
        decipher.final(),
      ]).toString('utf8');
    } catch {
      throw new ProviderBoundaryError('provider_reference_invalid');
    }
  }

  stableKey(rawReference: string): StableAccountKey {
    return `acct_${createHmac('sha256', this.key)
      .update(rawReference, 'utf8')
      .digest('base64url')}` as StableAccountKey;
  }

  stableProviderKey(
    kind: ProviderIdentifierKind,
    rawIdentifier: string,
  ): StableProviderKey {
    if (rawIdentifier.length === 0) {
      throw new ProviderBoundaryError('provider_reference_invalid');
    }
    return `${kind}_${createHmac('sha256', this.key)
      .update('aurum:robinhood:provider-record:v1\0', 'utf8')
      .update(kind, 'utf8')
      .update('\0', 'utf8')
      .update(rawIdentifier, 'utf8')
      .digest('base64url')}` as StableProviderKey;
  }
}
