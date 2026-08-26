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
      resources: { database: { close } as never, close },
      repositories: {
        portfolios: { createOwner: vi.fn() },
        oauthCredentials: { load: vi.fn().mockResolvedValue({ connectionState: 'connected', tokenSet: 'encrypted', lastHeartbeatAt: '2026-08-26T12:00:00.000Z' }) },
        alerts: { appendEvent: vi.fn() },
      },
    });
    await expect(composition.connectedHealthProbe?.()).resolves.toEqual({ providerVerified: true, workerHeartbeatAt: '2026-08-26T12:00:00.000Z' });
    await composition.resources.close();
    expect(close).toHaveBeenCalledOnce();
  });

  it('closes the single owned resource bundle when API composition setup fails', async () => {
    const close = vi.fn();
    await expect(createApiComposition({
      environment: apiEnvironment,
      resources: { database: { close } as never, close },
      repositories: { portfolios: { createOwner: vi.fn() }, oauthCredentials: { load: vi.fn() }, alerts: { appendEvent: vi.fn() } },
      createClerkVerifier: () => { throw new Error('clerk_setup_failed'); },
    })).rejects.toThrow('clerk_setup_failed');
    expect(close).toHaveBeenCalledOnce();
  });

  it('rejects worker composition before creating provider authority when enrollment is not connected', async () => {
    const close = vi.fn();
    const load = vi.fn().mockResolvedValue({
      connectionState: 'enrolling',
      tokenSet: 'encrypted',
      clientInformation: null,
      tokenUpdatedAt: null,
      lastHeartbeatAt: null,
    });
    const createStore = vi.fn(() => ({ load, markHeartbeat: vi.fn() }));

    await expect(createWorkerComposition({
      environment: workerEnvironment,
      resources: { database: { close } as never, close },
      repositories: { portfolios: { createOwner: vi.fn() }, oauthCredentials: { load: vi.fn() }, alerts: { appendEvent: vi.fn() } },
      ownerId: '11111111-1111-5111-8111-111111111111',
      createStore,
    })).rejects.toThrow('verified_robinhood_authorization_required');

    expect(createStore).toHaveBeenCalledOnce();
    expect(close).toHaveBeenCalledOnce();
  });

  it('rejects worker composition when the encrypted enrollment cannot be decrypted', async () => {
    const close = vi.fn();
    const load = vi.fn().mockRejectedValue(new Error('synthetic_decryption_failure'));

    await expect(createWorkerComposition({
      environment: workerEnvironment,
      resources: { database: { close } as never, close },
      repositories: { portfolios: { createOwner: vi.fn() }, oauthCredentials: { load: vi.fn() }, alerts: { appendEvent: vi.fn() } },
      ownerId: '11111111-1111-5111-8111-111111111111',
      createStore: () => ({ load, markHeartbeat: vi.fn() }),
    })).rejects.toThrow('verified_robinhood_authorization_required');

    expect(close).toHaveBeenCalledOnce();
  });

  it('pins the worker endpoint, stores OAuth by internal owner UUID, and heartbeats only after promotion', async () => {
    const markHeartbeat = vi.fn();
    const evaluateAlerts = vi.fn();
    const composition = await createWorkerComposition({
      environment: workerEnvironment,
      resources: { database: { close: vi.fn() } as never, close: vi.fn() },
      repositories: { portfolios: { createOwner: vi.fn() }, oauthCredentials: { load: vi.fn() }, alerts: { appendEvent: vi.fn() } },
      ownerId: '11111111-1111-5111-8111-111111111111',
      createStore: (_credentials, ownerId) => ({ ownerId, load: vi.fn().mockResolvedValue({ connectionState: 'connected', clientInformation: { client_id: 'synthetic-client' }, tokens: { refresh_token: 'synthetic-refresh' } }), markHeartbeat }),
      evaluateAlerts,
    });
    expect(composition.endpoint).toBe('https://agent.robinhood.com/mcp/trading');
    expect(composition.authProvider).toHaveProperty('redirectUrl');
    await composition.afterSnapshotPromoted({ userId: 'ignored-clerk-id', snapshotId: 'snapshot', sourceAsOf: '2026-08-26T12:00:00.000Z', calculationVersion: 'v1' });
    expect(evaluateAlerts).toHaveBeenCalledWith({ userId: 'ignored-clerk-id', snapshotId: 'snapshot', sourceAsOf: '2026-08-26T12:00:00.000Z', calculationVersion: 'v1' });
    expect(markHeartbeat).toHaveBeenCalledOnce();
    expect(evaluateAlerts.mock.invocationCallOrder[0]!).toBeLessThan(markHeartbeat.mock.invocationCallOrder[0]!);
  });

  it('does not heartbeat when PostgreSQL alert evaluation fails', async () => {
    const markHeartbeat = vi.fn();
    const composition = await createWorkerComposition({
      environment: workerEnvironment,
      resources: { database: { close: vi.fn() } as never, close: vi.fn() },
      repositories: { portfolios: { createOwner: vi.fn() }, oauthCredentials: { load: vi.fn() }, alerts: { appendEvent: vi.fn() } },
      ownerId: '11111111-1111-5111-8111-111111111111',
      createStore: () => ({ load: vi.fn().mockResolvedValue({ connectionState: 'connected', clientInformation: { client_id: 'synthetic-client' }, tokens: { refresh_token: 'synthetic-refresh' } }), markHeartbeat }),
      evaluateAlerts: async () => { throw new Error('alert_evaluation_failed'); },
    });
    await expect(composition.afterSnapshotPromoted({ userId: 'owner', snapshotId: 'snapshot', sourceAsOf: '2026-08-26T12:00:00.000Z', calculationVersion: 'v1' })).rejects.toThrow('alert_evaluation_failed');
    expect(markHeartbeat).not.toHaveBeenCalled();
  });
});
