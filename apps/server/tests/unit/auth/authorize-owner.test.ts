import { describe, expect, it } from 'vitest';
import { authorizeOwner, type AuthenticatedPrincipal } from '../../../src/auth';

const principal: AuthenticatedPrincipal = {
  clerkUserId: 'user_owner',
  email: 'Owner@Example.test',
  emailVerified: true,
  sessionId: 'session-a',
  authorizedParty: 'https://portfolio.example.test',
  authentication: {
    method: 'passkey',
    verifiedAt: '2026-08-25T14:59:00.000Z',
  },
};

const allowlist = {
  clerkUserId: 'user_owner',
  email: 'owner@example.test',
  authorizedParty: 'https://portfolio.example.test',
};

describe('owner authorization', () => {
  it('requires exact user ID, normalized verified email, and authorized party', () => {
    expect(authorizeOwner(principal, allowlist)).toMatchObject({ owner: true });
    expect(() =>
      authorizeOwner({ ...principal, clerkUserId: 'user_other' }, allowlist),
    ).toThrow(/user_mismatch/);
    expect(() =>
      authorizeOwner({ ...principal, email: 'other@example.test' }, allowlist),
    ).toThrow(/email_mismatch/);
    expect(() =>
      authorizeOwner({ ...principal, authorizedParty: 'https://evil.example' }, allowlist),
    ).toThrow(/authorized_party/);
  });

  it('rejects an unverified email even when every string matches', () => {
    expect(() =>
      authorizeOwner(
        { ...principal, emailVerified: false } as unknown as AuthenticatedPrincipal,
        allowlist,
      ),
    ).toThrow(/verified_email_required/);
  });

  it('returns the normalized verified owner email', () => {
    expect(authorizeOwner(principal, allowlist).email).toBe('owner@example.test');
  });
});
