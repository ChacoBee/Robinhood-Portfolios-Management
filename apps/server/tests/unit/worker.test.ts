import type { OAuthClientProvider } from '@modelcontextprotocol/client';
import { describe, expect, it, vi } from 'vitest';
import {
  startWorker,
  type TrustedRobinhoodWorkerComposition,
} from '../../src/worker';

const oauthProvider = {
  get redirectUrl() {
    return undefined;
  },
  get clientMetadata() {
    return { redirect_uris: [] };
  },
  clientInformation: () => undefined,
  tokens: () => undefined,
  saveTokens: async () => undefined,
  redirectToAuthorization: async () => undefined,
  saveCodeVerifier: async () => undefined,
  codeVerifier: () => '',
} satisfies OAuthClientProvider;

describe('connected worker composition', () => {
  it('fails closed without an injected verified authorization composition', async () => {
    await expect(
      startWorker({
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
        ACCOUNT_REFERENCE_ENCRYPTION_KEY: Buffer.alloc(32, 31).toString(
          'base64',
        ),
        ROBINHOOD_OAUTH_ENCRYPTION_KEY: Buffer.alloc(32, 32).toString('base64'),
      }),
    ).rejects.toThrow('verified_robinhood_authorization_required');
  });

  it('accepts an OAuth client provider composition before enforcing alert composition', async () => {
    const close = vi.fn();
    const composition: Omit<TrustedRobinhoodWorkerComposition, 'afterSnapshotPromoted'> = {
      resources: { database: { close } as never, close },
      endpoint: 'https://mcp.example.test',
      approvedEndpointOrigins: ['https://mcp.example.test'],
      authProvider: oauthProvider,
    };

    await expect(
      startWorker(
        {
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
          ACCOUNT_REFERENCE_ENCRYPTION_KEY: Buffer.alloc(32, 31).toString(
            'base64',
          ),
          ROBINHOOD_OAUTH_ENCRYPTION_KEY: Buffer.alloc(32, 32).toString('base64'),
        },
        composition as TrustedRobinhoodWorkerComposition,
      ),
    ).rejects.toThrow('alert_evaluation_composition_required');
    expect(close).toHaveBeenCalledOnce();
  });
});
