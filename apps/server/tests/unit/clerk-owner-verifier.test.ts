import { describe, expect, it, vi } from 'vitest';
import { createClerkOwnerVerifier } from '../../src/runtime/clerk-owner-verifier';

const origin = 'https://portfolio.example.test';
const issuer = 'https://synthetic.clerk.accounts.dev';

describe('Clerk owner verifier', () => {
  it('authenticates only a session token for the exact web origin and maps iat to single factor', async () => {
    const authenticateRequest = vi.fn().mockResolvedValue({
      isAuthenticated: true,
      toAuth: () => ({ userId: 'user_owner123', sessionId: 'sess_owner', sessionClaims: { iat: 1_725_000_000, iss: issuer, azp: origin } }),
    });
    const getUser = vi.fn().mockResolvedValue({
      primaryEmailAddressId: 'id_primary',
      emailAddresses: [{ id: 'id_primary', emailAddress: 'Owner@Example.test', verification: { status: 'verified' } }],
    });
    const verifier = createClerkOwnerVerifier({
      secretKey: 'synthetic-secret-key', publishableKey: 'synthetic-public-key', webOrigin: origin, issuer,
      createClient: () => ({ authenticateRequest, users: { getUser } }),
    });

    await expect(verifier.verify(new Request(`${origin}/v1/dashboard`))).resolves.toEqual({
      clerkUserId: 'user_owner123', email: 'Owner@Example.test', emailVerified: true,
      sessionId: 'sess_owner', authorizedParty: origin,
      authentication: { method: 'single_factor', verifiedAt: '2024-08-30T06:40:00.000Z' },
    });
    expect(authenticateRequest).toHaveBeenCalledWith(expect.any(Request), {
      authorizedParties: [origin], acceptsToken: 'session_token',
    });
  });

  it.each([
    ['missing session', { userId: 'user_owner123', sessionId: null, sessionClaims: { iss: issuer, azp: origin } }],
    ['wrong issuer', { userId: 'user_owner123', sessionId: 'sess_owner', sessionClaims: { iss: 'https://wrong.example.test', azp: origin } }],
    ['wrong party', { userId: 'user_owner123', sessionId: 'sess_owner', sessionClaims: { iss: issuer, azp: 'https://wrong.example.test' } }],
    ['non-finite iat', { userId: 'user_owner123', sessionId: 'sess_owner', sessionClaims: { iss: issuer, azp: origin, iat: Infinity } }],
  ])('fails closed for %s', async (_label, auth) => {
    const verifier = createClerkOwnerVerifier({
      secretKey: 'synthetic-secret-key', publishableKey: 'synthetic-public-key', webOrigin: origin, issuer,
      createClient: () => ({
        authenticateRequest: async () => ({ isAuthenticated: true, toAuth: () => auth }),
        users: { getUser: async () => ({ primaryEmailAddressId: 'id_primary', emailAddresses: [{ id: 'id_primary', emailAddress: 'owner@example.test', verification: { status: 'verified' } }] }) },
      }),
    });
    await expect(verifier.verify(new Request(`${origin}/v1/dashboard`))).rejects.toThrow('authentication_required');
  });

  it('fails closed when the Clerk primary email is unverified', async () => {
    const verifier = createClerkOwnerVerifier({
      secretKey: 'synthetic-secret-key', publishableKey: 'synthetic-public-key', webOrigin: origin, issuer,
      createClient: () => ({
        authenticateRequest: async () => ({ isAuthenticated: true, toAuth: () => ({ userId: 'user_owner123', sessionId: 'sess_owner', sessionClaims: { iss: issuer, azp: origin, iat: 1_725_000_000 } }) }),
        users: { getUser: async () => ({ primaryEmailAddressId: 'id_primary', emailAddresses: [{ id: 'id_primary', emailAddress: 'owner@example.test', verification: { status: 'unverified' } }] }) },
      }),
    });
    await expect(verifier.verify(new Request(`${origin}/v1/dashboard`))).rejects.toThrow('verified_email_required');
  });

  it('fails closed when an authenticated Clerk principal is not the configured owner', async () => {
    const verifier = createClerkOwnerVerifier({
      secretKey: 'synthetic-secret-key', publishableKey: 'synthetic-public-key', webOrigin: origin, issuer,
      ownerClerkUserId: 'user_expected', ownerEmail: 'owner@example.test',
      createClient: () => ({
        authenticateRequest: async () => ({ isAuthenticated: true, toAuth: () => ({ userId: 'user_other', sessionId: 'sess_owner', sessionClaims: { iss: issuer, azp: origin, iat: 1_725_000_000 } }) }),
        users: { getUser: async () => ({ primaryEmailAddressId: 'id_primary', emailAddresses: [{ id: 'id_primary', emailAddress: 'owner@example.test', verification: { status: 'verified' } }] }) },
      }),
    });
    await expect(verifier.verify(new Request(`${origin}/v1/dashboard`))).rejects.toThrow('owner_user_mismatch');
  });

  it('constructs the Clerk client with only the configured server keys', () => {
    const createClient = vi.fn(() => ({ authenticateRequest: vi.fn(), users: { getUser: vi.fn() } }));
    createClerkOwnerVerifier({ secretKey: 'synthetic-secret-key', publishableKey: 'synthetic-public-key', webOrigin: origin, issuer, createClient });
    expect(createClient).toHaveBeenCalledWith({ secretKey: 'synthetic-secret-key', publishableKey: 'synthetic-public-key' });
  });

  it.each([
    ['unauthenticated request', 'authentication_required', { isAuthenticated: false, toAuth: () => ({}) }],
    ['missing user', 'authentication_required', { isAuthenticated: true, toAuth: () => ({ sessionId: 'sess', sessionClaims: { iss: issuer, azp: origin, iat: 1_725_000_000 } }) }],
    ['missing primary email', 'verified_email_required', { isAuthenticated: true, toAuth: () => ({ userId: 'user_owner123', sessionId: 'sess', sessionClaims: { iss: issuer, azp: origin, iat: 1_725_000_000 } }) }],
  ])('rejects %s', async (_label, expected, response) => {
    const verifier = createClerkOwnerVerifier({
      secretKey: 'synthetic-secret-key', publishableKey: 'synthetic-public-key', webOrigin: origin, issuer,
      createClient: () => ({ authenticateRequest: async () => response, users: { getUser: async () => ({ primaryEmailAddressId: null, emailAddresses: [] }) } }),
    });
    await expect(verifier.verify(new Request(`${origin}/v1/dashboard`))).rejects.toThrow(expected);
  });

  it('rejects a missing configured primary-email record and configured owner email mismatch', async () => {
    const client = (emailAddress: string, primaryEmailAddressId = 'id_missing') => ({
      authenticateRequest: async () => ({ isAuthenticated: true, toAuth: () => ({ userId: 'user_owner123', sessionId: 'sess', sessionClaims: { iss: issuer, azp: origin, iat: 1_725_000_000 } }) }),
      users: { getUser: async () => ({ primaryEmailAddressId, emailAddresses: [{ id: 'id_actual', emailAddress, verification: { status: 'verified' } }] }) },
    });
    await expect(createClerkOwnerVerifier({ secretKey: 'synthetic-secret-key', publishableKey: 'synthetic-public-key', webOrigin: origin, issuer, createClient: () => client('owner@example.test') }).verify(new Request(origin))).rejects.toThrow('verified_email_required');
    await expect(createClerkOwnerVerifier({ secretKey: 'synthetic-secret-key', publishableKey: 'synthetic-public-key', webOrigin: origin, issuer, ownerEmail: 'owner@example.test', createClient: () => client('other@example.test', 'id_actual') }).verify(new Request(origin))).rejects.toThrow('owner_email_mismatch');
  });
});
