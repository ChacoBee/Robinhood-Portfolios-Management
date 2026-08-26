import { describe, expect, it } from 'vitest';
import { startApi } from '../../src/api';

const environment = {
  APP_MODE: 'connected',
  NODE_ENV: 'test',
  DATABASE_URL: 'postgresql://localhost/aurum',
  OWNER_CLERK_USER_ID: 'user_owner123',
  OWNER_EMAIL: 'owner@example.test',
  WEB_ORIGIN: 'https://portfolio.example.test',
  CLERK_PUBLISHABLE_KEY: 'pk_test_synthetic_public_identity_12345',
  CLERK_ISSUER_URL: 'https://synthetic.clerk.accounts.dev',
  CLERK_SECRET_KEY: 'sk_test_12345678901234567890',
  CSRF_SECRET: 'synthetic-csrf-secret-is-at-least-32-chars',
  ACCOUNT_REFERENCE_ENCRYPTION_KEY: Buffer.alloc(32, 31).toString('base64'),
  ROBINHOOD_OAUTH_ENCRYPTION_KEY: Buffer.alloc(32, 32).toString('base64'),
} as const;

describe('connected API composition', () => {
  it('fails closed without the trusted private composition', async () => {
    await expect(startApi(environment)).rejects.toThrow(
      'trusted_api_composition_required',
    );
  });

  it('requires an operational health probe before opening the database', async () => {
    await expect(
      startApi(environment, {
        ownerVerifier: {
          verify: async () => ({
            clerkUserId: 'user_owner123',
            email: 'owner@example.test',
            emailVerified: true,
            sessionId: 'session-owner',
            authorizedParty: 'https://portfolio.example.test',
            authentication: {
              method: 'passkey' as const,
              verifiedAt: '2026-08-25T14:59:00.000Z',
            },
          }),
        },
      }),
    ).rejects.toThrow('connected_health_probe_required');
  });
});
