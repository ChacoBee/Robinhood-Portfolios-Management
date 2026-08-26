import { describe, expect, it, vi } from 'vitest';
import type {
  AccountDetailReadModel,
  AccountsReadModel,
  ActivityReadModel,
  AlertsReadModel,
  AnalyticsReadModel,
  DashboardReadModel,
  HealthReadModel,
  HoldingDetailReadModel,
  HoldingsReadModel,
  PerformanceRange,
  PerformanceReadModel,
  ReconciliationReadModel,
  RefreshReadModel,
} from '@aurum/domain';
import { createApi } from '../../src/app';
import { createDemoReadModelSource } from '../../src/read-models/demo-source';
import type { PortfolioReadModelSource } from '../../src/read-models/source';

const demoConfig = { APP_MODE: 'demo', NODE_ENV: 'test' } as const;

describe('typed portfolio API', () => {
  it('serves every read model in one consistent envelope', async () => {
    const app = createApi(demoConfig, {
      repositories: null,
      now: () => new Date('2026-08-25T15:00:00.000Z'),
      readModels: createDemoReadModelSource({
        now: () => new Date('2026-08-25T15:00:00.000Z'),
      }),
    });

    const cases = [
      ['/v1/dashboard', 'mode'],
      ['/v1/accounts', 'accounts'],
      ['/v1/accounts/demo-taxable', 'account'],
      ['/v1/holdings', 'holdings'],
      ['/v1/holdings/demo-aurx', 'holding'],
      ['/v1/performance?range=1M', 'range'],
      ['/v1/analytics', 'allocation'],
      ['/v1/activity', 'items'],
      ['/v1/activity/reconciliation', 'accounts'],
      ['/v1/alerts', 'alerts'],
      ['/v1/health', 'status'],
    ] as const;

    for (const [url, dataKey] of cases) {
      const response = await app.inject({ method: 'GET', url });
      expect(response.statusCode, url).toBe(200);
      expect(response.headers.etag, url).toMatch(/^"[a-f0-9]{64}"$/);
      expect(response.json(), url).toMatchObject({
        requestId: expect.any(String),
        generatedAt: '2026-08-25T15:00:00.000Z',
        data: { [dataKey]: expect.anything() },
      });
    }

    const refresh = await app.inject({ method: 'POST', url: '/v1/refresh' });
    expect(refresh.statusCode).toBe(200);
    expect(refresh.json()).toMatchObject({
      data: { state: 'disabled', jobId: null, mode: 'demo' },
    });
    await app.close();
  });

  it('registers safe Demo import and alert mutation routes in the composed API', async () => {
    const app = createApi(demoConfig, { repositories: null });

    const preview = await app.inject({
      method: 'POST',
      url: '/v1/imports/preview',
      payload: { fixture: 'synthetic-activity-v1' },
    });
    expect(preview.statusCode).toBe(200);
    expect(preview.json()).toMatchObject({
      data: { filename: 'synthetic-activity-v1.csv', acceptedRows: 2 },
    });

    const rule = await app.inject({
      method: 'POST',
      url: '/v1/alert-rules',
      payload: {
        kind: 'concentration_threshold',
        threshold: '0.30',
        scopeId: null,
        cooldownSeconds: 3_600,
        dailyCap: 3,
      },
    });
    expect(rule.statusCode).toBe(200);
    expect(rule.json()).toMatchObject({ data: { enabled: true } });

    await app.close();
  });

  it('returns 304 for a matching entity tag', async () => {
    const app = createApi(demoConfig, { repositories: null });
    const first = await app.inject({ method: 'GET', url: '/v1/dashboard' });
    const second = await app.inject({
      method: 'GET',
      url: '/v1/dashboard',
      headers: { 'if-none-match': first.headers.etag! },
    });

    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(304);
    expect(second.body).toBe('');
    await app.close();
  });

  it('validates range, path parameters, and unknown query keys', async () => {
    const app = createApi(demoConfig, { repositories: null });

    for (const url of [
      '/v1/performance?range=TODAY',
      '/v1/performance?range=1M&debug=true',
      '/v1/dashboard?debug=true',
      '/v1/accounts/%20',
    ]) {
      const response = await app.inject({ method: 'GET', url });
      expect(response.statusCode, url).toBe(400);
      expect(response.json(), url).toMatchObject({
        error: { code: 'invalid_request' },
        requestId: expect.any(String),
        generatedAt: expect.any(String),
      });
    }
    await app.close();
  });

  it('uses exact-origin CORS and does not reflect an attacker origin', async () => {
    const app = createApi(demoConfig, {
      repositories: null,
      webOrigin: 'https://portfolio.example.test',
    });
    const allowed = await app.inject({
      method: 'GET',
      url: '/v1/dashboard',
      headers: { origin: 'https://portfolio.example.test' },
    });
    const denied = await app.inject({
      method: 'GET',
      url: '/v1/dashboard',
      headers: { origin: 'https://attacker.example.test' },
    });

    expect(allowed.headers['access-control-allow-origin']).toBe(
      'https://portfolio.example.test',
    );
    expect(denied.headers['access-control-allow-origin']).toBeUndefined();
    await app.close();
  });

  it('never falls back to synthetic data in connected mode', async () => {
    const app = createApi(
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
        ACCOUNT_REFERENCE_ENCRYPTION_KEY: Buffer.alloc(32, 5).toString('base64'),
        ROBINHOOD_OAUTH_ENCRYPTION_KEY: Buffer.alloc(32, 6).toString('base64'),
      },
      {
        repositories: null,
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
      },
    );
    const response = await app.inject({ method: 'GET', url: '/v1/dashboard' });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toMatchObject({
      error: { code: 'source_unavailable' },
    });
    expect(response.body).not.toContain('Synthetic Demo');
    expect(response.body).not.toContain('demo-aurx');
    await app.close();
  });

  it('blocks a response if a source attempts to expose a private provider key', async () => {
    const safe = createDemoReadModelSource();
    const source: PortfolioReadModelSource = {
      getDashboard: vi.fn(async () => ({
        ...(await safe.getDashboard()),
        provider_account_key: 'raw-provider-account-secret',
      }) as DashboardReadModel),
      listAccounts: () => safe.listAccounts(),
      getAccount: (id: string) => safe.getAccount(id),
      listHoldings: () => safe.listHoldings(),
      getHolding: (id: string) => safe.getHolding(id),
      getPerformance: (range: PerformanceRange) => safe.getPerformance(range),
      getAnalytics: () => safe.getAnalytics(),
      getActivity: () => safe.getActivity(),
      getReconciliation: () => safe.getReconciliation(),
      getAlerts: () => safe.getAlerts(),
      requestRefresh: () => safe.requestRefresh(),
      getHealth: () => safe.getHealth(),
    };
    const app = createApi(demoConfig, { repositories: null, readModels: source });
    const response = await app.inject({ method: 'GET', url: '/v1/dashboard' });

    expect(response.statusCode).toBe(500);
    expect(response.json()).toMatchObject({
      error: { code: 'internal_error' },
    });
    expect(response.body).not.toContain('raw-provider-account-secret');
    await app.close();
  });

  it('keeps source failures behind a stable public error contract', async () => {
    const failing = async () => {
      throw new Error('bearer private-token account 123456789');
    };
    const source: PortfolioReadModelSource = {
      getDashboard: failing as () => Promise<DashboardReadModel>,
      listAccounts: failing as () => Promise<AccountsReadModel>,
      getAccount: failing as (id: string) => Promise<AccountDetailReadModel | null>,
      listHoldings: failing as () => Promise<HoldingsReadModel>,
      getHolding: failing as (id: string) => Promise<HoldingDetailReadModel | null>,
      getPerformance: failing as (range: PerformanceRange) => Promise<PerformanceReadModel>,
      getAnalytics: failing as () => Promise<AnalyticsReadModel>,
      getActivity: failing as () => Promise<ActivityReadModel>,
      getReconciliation: failing as () => Promise<ReconciliationReadModel>,
      getAlerts: failing as () => Promise<AlertsReadModel>,
      requestRefresh: failing as () => Promise<RefreshReadModel>,
      getHealth: failing as () => Promise<HealthReadModel>,
    };
    const app = createApi(demoConfig, { repositories: null, readModels: source });
    const response = await app.inject({ method: 'GET', url: '/v1/dashboard' });

    expect(response.statusCode).toBe(500);
    expect(response.body).not.toContain('private-token');
    expect(response.body).not.toContain('123456789');
    await app.close();
  });
});
