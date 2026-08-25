import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { AesGcmAccountReferenceVault } from '../../src/robinhood/vault';

const key = Buffer.alloc(32, 13).toString('base64');

describe('provider account reference vault', () => {
  it('round-trips randomized authenticated ciphertext without plaintext leakage', () => {
    const vault = new AesGcmAccountReferenceVault(key);
    const first = vault.seal('provider-account-123456789');
    const second = vault.seal('provider-account-123456789');

    expect(first).not.toBe(second);
    expect(first).not.toContain('provider-account-123456789');
    expect(vault.open(first)).toBe('provider-account-123456789');
    expect(vault.stableKey('provider-account-123456789')).toBe(
      vault.stableKey('provider-account-123456789'),
    );
  });

  it('rejects short keys, tampering, and unknown envelope versions', () => {
    expect(() => new AesGcmAccountReferenceVault('c2hvcnQ=')).toThrow(
      'provider_reference_invalid',
    );
    const vault = new AesGcmAccountReferenceVault(key);
    const reference = vault.seal('provider-account-1');
    const parts = reference.split('.');
    const tag = parts[3] ?? '';
    parts[3] = `${tag.startsWith('a') ? 'b' : 'a'}${tag.slice(1)}`;
    const tampered = parts.join('.');

    expect(() => vault.open(tampered as typeof reference)).toThrow(
      'provider_reference_invalid',
    );
    expect(() => vault.open('v2.a.b.c' as typeof reference)).toThrow(
      'provider_reference_invalid',
    );
  });

  it('derives provider record identifiers with a keyed, domain-separated HMAC', () => {
    const vault = new AesGcmAccountReferenceVault(key);
    const otherVault = new AesGcmAccountReferenceVault(
      Buffer.alloc(32, 14).toString('base64'),
    );
    const rawIdentifier = 'synthetic-instrument-1';
    const bareSha = createHash('sha256')
      .update(rawIdentifier, 'utf8')
      .digest('base64url');

    expect(vault.stableProviderKey('instrument', rawIdentifier)).toBe(
      vault.stableProviderKey('instrument', rawIdentifier),
    );
    expect(vault.stableProviderKey('instrument', rawIdentifier)).not.toBe(
      `instrument_${bareSha}`,
    );
    expect(vault.stableProviderKey('instrument', rawIdentifier)).not.toBe(
      vault.stableProviderKey('option', rawIdentifier),
    );
    expect(vault.stableProviderKey('instrument', rawIdentifier)).not.toBe(
      otherVault.stableProviderKey('instrument', rawIdentifier),
    );
  });
});
