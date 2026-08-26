import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import { loadTrustedComposition } from '../../src/runtime/composition-loader';
import {
  createApiComposition,
  createWorkerComposition,
} from '../../src/runtime/trusted-composition';

const apiEnvironment = {
  APP_MODE: 'connected', NODE_ENV: 'test', DATABASE_URL: 'postgresql://localhost/aurum',
  OWNER_CLERK_USER_ID: 'user_owner123', OWNER_EMAIL: 'owner@example.test', WEB_ORIGIN: 'http://localhost:3000',
  CLERK_PUBLISHABLE_KEY: 'pk_test_synthetic_public_identity_12345', CLERK_ISSUER_URL: 'https://synthetic.clerk.accounts.dev',
  CLERK_SECRET_KEY: 'synthetic-secret-key', CSRF_SECRET: 'synthetic-csrf-secret-is-at-least-32-chars',
} as const;
const workerEnvironment = {
  APP_MODE: 'connected', NODE_ENV: 'test', DATABASE_URL: 'postgresql://localhost/aurum',
  OWNER_CLERK_USER_ID: 'user_owner123', OWNER_EMAIL: 'owner@example.test',
  ACCOUNT_REFERENCE_ENCRYPTION_KEY: Buffer.alloc(32, 19).toString('base64'),
  ROBINHOOD_OAUTH_ENCRYPTION_KEY: Buffer.alloc(32, 23).toString('base64'),
} as const;

const fixture = fileURLToPath(
  new URL('../fixtures/trusted-composition.mjs', import.meta.url),
);

describe('trusted runtime composition loader', () => {
  it('loads only an explicit factory from an absolute private module path', async () => {
    await expect(
      loadTrustedComposition(fixture, 'createApiComposition'),
    ).resolves.toEqual({ marker: 'synthetic-api-composition' });
  });

  it('returns null when no private module is configured', async () => {
    await expect(
      loadTrustedComposition(undefined, 'createApiComposition'),
    ).resolves.toBeNull();
  });

  it('rejects relative paths and missing factories', async () => {
    await expect(
      loadTrustedComposition('./composition.mjs', 'createApiComposition'),
    ).rejects.toThrow('trusted_composition_path_must_be_absolute');
    await expect(
      loadTrustedComposition(fixture, 'missingFactory'),
    ).rejects.toThrow('trusted_composition_factory_missing');
  });

  it('uses durable credential metadata for API health without decrypting provider tokens', async () => {
    const close = vi.fn();
    const composition = await createApiComposition({
      environment: apiEnvironment,
      database: { close },
      repositories: {
        portfolios: { createOwner: vi.fn() },
        oauthCredentials: { load: vi.fn().mockResolvedValue({ connectionState: 'connected', tokenSet: 'encrypted', lastHeartbeatAt: '2026-08-26T12:00:00.000Z' }) },
      },
    });
    await expect(composition.connectedHealthProbe?.()).resolves.toEqual({ providerVerified: true, workerHeartbeatAt: '2026-08-26T12:00:00.000Z' });
    await composition.close?.();
    expect(close).toHaveBeenCalledOnce();
  });

  it('pins the worker endpoint, stores OAuth by internal owner UUID, and heartbeats only after promotion', async () => {
    const markHeartbeat = vi.fn();
    const composition = await createWorkerComposition({
      environment: workerEnvironment,
      database: { close: vi.fn() },
      repositories: { portfolios: { createOwner: vi.fn() }, oauthCredentials: { load: vi.fn() } },
      ownerId: '11111111-1111-5111-8111-111111111111',
      createStore: (_credentials, ownerId) => ({ ownerId, markHeartbeat }),
    });
    expect(composition.endpoint).toBe('https://agent.robinhood.com/mcp/trading');
    expect(composition.authProvider).toHaveProperty('redirectUrl');
    await composition.afterSnapshotPromoted({ userId: 'ignored-clerk-id', snapshotId: 'snapshot', sourceAsOf: '2026-08-26T12:00:00.000Z', calculationVersion: 'v1' });
    expect(markHeartbeat).toHaveBeenCalledOnce();
  });
});
