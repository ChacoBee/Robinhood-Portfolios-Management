import { describe, expect, it } from 'vitest';
import { hasRecentPasskey, type AuthenticatedPrincipal } from '../../../src/auth';

const principal: AuthenticatedPrincipal = {
  clerkUserId: 'user_owner123',
  email: 'owner@example.test',
  emailVerified: true,
  sessionId: 'session-owner',
  authorizedParty: 'https://portfolio.example.test',
  authentication: {
    method: 'passkey',
    verifiedAt: '2026-08-25T14:59:00.000Z',
  },
};

describe('recent passkey assurance', () => {
  it('requires a passkey verification within five minutes', () => {
    const now = new Date('2026-08-25T15:00:00.000Z');
    expect(hasRecentPasskey(principal, now)).toBe(true);
    expect(
      hasRecentPasskey({
        ...principal,
        authentication: { method: 'mfa', verifiedAt: principal.authentication.verifiedAt },
      }, now),
    ).toBe(false);
    expect(
      hasRecentPasskey({
        ...principal,
        authentication: { method: 'passkey', verifiedAt: '2026-08-25T14:54:59.000Z' },
      }, now),
    ).toBe(false);
  });
});
