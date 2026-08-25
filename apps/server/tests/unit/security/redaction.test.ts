import { describe, expect, it } from 'vitest';
import { REDACTED, redactStructured, redactText, safeError } from '../../../src/security';

describe('structured redaction', () => {
  it('redacts tokens, cookies, account identifiers, and raw payloads', () => {
    const redacted = redactStructured({
      authorization: 'Bearer secret-token',
      nested: {
        cookie: 'session=secret',
        accountNumber: '123456789012',
        providerPayload: { balance: '1000' },
        safe: 'visible',
      },
    });
    expect(redacted).toEqual({
      authorization: REDACTED,
      nested: {
        cookie: REDACTED,
        accountNumber: REDACTED,
        providerPayload: REDACTED,
        safe: 'visible',
      },
    });
  });

  it('redacts bearer values and long numeric identifiers in error messages', () => {
    expect(redactText('Bearer abc.def account 123456789012')).not.toContain('abc.def');
    expect(safeError(new Error('token Bearer abc.def for 123456789012')).message).toBe(
      `token Bearer ${REDACTED} for ${REDACTED}`,
    );
  });
});
