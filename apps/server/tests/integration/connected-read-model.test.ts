import { afterEach, describe, expect, it } from 'vitest';
import { createApi } from '../../src/app';
import { createRepositories } from '../../src/db/repositories';
import { createConnectedReadModelSource } from '../../src/read-models/connected-source';
import { AesGcmAccountReferenceVault } from '../../src/robinhood/vault';
import { createTestDatabase } from '../helpers/database';

const openDatabases: Array<() => Promise<void>> = [];
const providerIdentifierKeyer = new AesGcmAccountReferenceVault(
  Buffer.alloc(32, 31).toString('base64'),
);

afterEach(async () => {
  await Promise.all(openDatabases.splice(0).map((close) => close()));
});

async function setupConnectedSource(
  now = new Date('2026-08-25T14:01:00.000Z'),
) {
  const database = await createTestDatabase();
  openDatabases.push(database.close);
  const repositories = createRepositories(database.client, {
    providerIdentifierKeyer,
  });
  const ownerId = '00000000-0000-4000-8000-000000000701';
  await repositories.portfolios.createOwner({
    id: ownerId,
    email: 'api-owner@example.test',
  });
  await repositories.portfolios.promoteSnapshot({
    id: '00000000-0000-4000-8000-000000000710',
    userId: ownerId,
    syncRunId: '00000000-0000-4000-8000-000000000720',
    totalValue: '100',
    asOf: '2026-08-24T20:00:00.000Z',
    coverage: 'complete',
    freshness: 'fresh',
    reconciliationStatus: 'reconciled',
    calculationVersion: 'portfolio-v1',
    sourceFingerprint: 'connected-api-prior-close-v1',
    payload: { source: 'robinhood_readonly' },
    accounts: [],
  });
  await repositories.portfolios.promoteSnapshot({
    id: '00000000-0000-4000-8000-000000000711',
    userId: ownerId,
    syncRunId: '00000000-0000-4000-8000-000000000721',
    totalValue: '125',
    asOf: '2026-08-25T14:00:20.000Z',
    coverage: 'complete',
    freshness: 'fresh',
    reconciliationStatus: 'reconciled',
    calculationVersion: 'portfolio-v1',
    sourceFingerprint: 'connected-api-fixture-v1',
    payload: {
      source: 'robinhood_readonly',
      quoteFreshness: 'fresh',
      unsupportedDetailValue: '0',
    },
    accounts: [
      {
        stableKey: 'rh_account_opaque_hash' as never,
        maskedAccountNumber: '•••• 6789',
        displayName: 'Primary brokerage',
        status: 'active',
        totalKind: 'provider_portfolio_value',
        included: true,
        inclusionReason: 'active',
        providerTotal: '125',
        cash: '25',
        accrued: '0',
        supportedPositionValue: '100',
        unsupportedDetailValue: '0',
        modeledTotal: '125',
        residual: '0',
        tolerance: '0.02',
        reconciliationState: 'reconciled',
        coverage: 'complete',
        accountSourceAsOf: '2026-08-25T14:00:00.000Z',
        portfolioSourceAsOf: '2026-08-25T14:00:20.000Z',
        sourceWindowStart: '2026-08-25T14:00:00.000Z',
        sourceWindowEnd: '2026-08-25T14:00:30.000Z',
        accountChecksum: 'account-checksum',
        portfolioChecksum: 'portfolio-checksum',
        equityPositionsChecksum: 'positions-checksum',
        optionPositionsChecksum: 'options-checksum',
        quotesChecksum: 'quotes-checksum',
        equityPositions: [
          {
            instrumentId: 'provider-instrument-must-not-leak',
            symbol: 'SYN1',
            name: 'Synthetic One',
            assetClass: 'equity',
            quantity: '10',
            marketValue: '100',
            costBasis: '80',
            costBasisSource: 'provider_average',
            currency: 'USD',
            sourceAsOf: '2026-08-25T14:00:30.000Z',
            detailSupport: 'supported',
          },
        ],
        optionPositions: [],
        quotes: [
          {
            instrumentId: 'provider-instrument-must-not-leak',
            symbol: 'SYN1',
            price: '10',
            currency: 'USD',
            marketState: 'regular',
            sourceAsOf: '2026-08-25T14:00:40.000Z',
            quality: 'complete',
          },
        ],
      },
    ],
  });

  const account = await database.client.query<{ id: string }>(
    `select id from accounts where user_id = $1 limit 1`,
    [ownerId],
  );
  await database.client.query(
    `insert into transactions (
       id, user_id, account_id, kind, amount, currency, effective_at,
       source_transaction_id, source_fingerprint, description, provenance
     ) values ($1, $2, $3, 'deposit', 20, 'USD', $4, $5, $6, $7, $8::jsonb)`,
    [
      '00000000-0000-4000-8000-000000000731',
      ownerId,
      account.rows[0]!.id,
      '2026-08-25T13:00:00.000Z',
      'synthetic-deposit-1',
      'synthetic-deposit-fingerprint-1',
      'Synthetic external deposit',
      JSON.stringify({ source: 'synthetic_test', timestampPrecision: 'instant' }),
    ],
  );

  const source = createConnectedReadModelSource({
    database: database.client,
    jobs: repositories.jobs,
    ownerEmail: 'api-owner@example.test',
    now: () => now,
    healthProbe: async () => ({
      providerVerified: true,
      workerHeartbeatAt: new Date(now.getTime() - 30_000).toISOString(),
    }),
  });
  return { database, ownerId, repositories, source };
}

describe('connected last-good read models', () => {
  it('builds public read models only from the current immutable snapshot', async () => {
    const { database, source } = await setupConnectedSource();
    await database.client.query(
      "update accounts set masked_account_number = '123456789'",
    );
    const dashboard = await source.getDashboard();

    expect(dashboard).toMatchObject({
      mode: 'connected',
      connectionState: 'live',
      portfolioValue: { amount: '125', currency: 'USD' },
      accounts: [
        {
          displayName: 'Primary brokerage',
          maskedAccountNumber: '•••• 6789',
        },
      ],
      topHoldings: [{ symbol: 'SYN1', quantity: '10' }],
      dailyChange: null,
      dailyChangeRatio: null,
      quality: {
        reasons: expect.arrayContaining(['flow_coverage_incomplete']),
      },
    });
    expect(JSON.stringify(dashboard)).not.toContain(
      'provider-instrument-must-not-leak',
    );
    expect(JSON.stringify(dashboard)).not.toContain('rh_account_opaque_hash');
    expect(JSON.stringify(dashboard)).not.toContain('123456789');
  });

  it('keeps serving last-good data while exposing a failed latest sync as source_error', async () => {
    const { ownerId, repositories, source } = await setupConnectedSource();
    await repositories.portfolios.recordFailedRun(ownerId, 'provider_timeout');

    await expect(source.getDashboard()).resolves.toMatchObject({
      connectionState: 'source_error',
      portfolioValue: { amount: '125' },
      quality: { reasons: expect.arrayContaining(['latest_sync_failed']) },
    });
  });

  it('keeps last-good values accessible while degraded operations disable the live label', async () => {
    const { database, repositories } = await setupConnectedSource();
    const source = createConnectedReadModelSource({
      database: database.client,
      jobs: repositories.jobs,
      ownerEmail: 'api-owner@example.test',
      now: () => new Date('2026-08-25T14:01:00.000Z'),
      healthProbe: async () => ({
        providerVerified: false,
        workerHeartbeatAt: '2026-08-25T13:50:00.000Z',
      }),
    });

    await expect(source.getDashboard()).resolves.toMatchObject({
      connectionState: 'disconnected',
      sourceLabel: expect.stringContaining('connection health is degraded'),
      portfolioValue: { amount: '125' },
      capabilities: { liveBrokerage: false },
    });
  });

  it('accepts the first next-available close checkpoint but never a pre-close approximation', async () => {
    const nextAvailable = await setupConnectedSource();
    await nextAvailable.database.client.query(
      `update portfolio_snapshots
       set as_of = '2026-08-24T20:10:00.000Z'
       where id = '00000000-0000-4000-8000-000000000710'`,
    );
    await expect(nextAvailable.source.getDashboard()).resolves.toMatchObject({
      dailyChange: null,
      quality: {
        reasons: expect.arrayContaining(['flow_coverage_incomplete']),
      },
    });

    const preClose = await setupConnectedSource();
    await preClose.database.client.query(
      `update portfolio_snapshots
       set as_of = '2026-08-24T19:55:00.000Z'
       where id = '00000000-0000-4000-8000-000000000710'`,
    );
    await expect(preClose.source.getDashboard()).resolves.toMatchObject({
      dailyChange: null,
      quality: {
        reasons: expect.arrayContaining(['missing_prior_close']),
      },
    });
  });

  it('ages an old regular-session snapshot to disconnected at read time', async () => {
    const { source } = await setupConnectedSource(
      new Date('2026-08-25T14:10:00.000Z'),
    );

    await expect(source.getDashboard()).resolves.toMatchObject({
      connectionState: 'disconnected',
      quality: {
        freshness: 'stale',
        reasons: expect.arrayContaining(['source_stale']),
      },
      capabilities: { liveBrokerage: false },
    });
  });

  it('bounds freshness after hours even when the snapshot is after the last close', async () => {
    const { database, source } = await setupConnectedSource(
      new Date('2026-08-25T23:00:00.000Z'),
    );
    await database.client.query(
      `update portfolio_snapshots
       set as_of = '2026-08-25T20:05:00.000Z'
       where is_current = true`,
    );
    await expect(source.getDashboard()).resolves.toMatchObject({
      connectionState: 'disconnected',
      quality: {
        freshness: 'stale',
        reasons: expect.arrayContaining(['source_stale']),
      },
    });
  });

  it('reports operational health from an injected private health probe', async () => {
    const { database, repositories } = await setupConnectedSource();
    const source = createConnectedReadModelSource({
      database: database.client,
      jobs: repositories.jobs,
      ownerEmail: 'api-owner@example.test',
      now: () => new Date('2026-08-25T14:01:00.000Z'),
      healthProbe: async () => ({
        providerVerified: true,
        workerHeartbeatAt: '2026-08-25T14:00:30.000Z',
      }),
    });

    await expect(source.getHealth()).resolves.toMatchObject({
      status: 'ok',
      mode: 'connected',
      database: 'ready',
      worker: 'healthy',
      provider: 'configured',
      lastSuccessfulRefreshAt: expect.any(String),
    });
  });

  it('returns persisted factual evidence and mute state in the alert inbox', async () => {
    const { database, ownerId, source } = await setupConnectedSource();
    const ruleId = '00000000-0000-4000-8000-000000000741';
    const alertId = '00000000-0000-4000-8000-000000000742';
    await database.client.query(
      `insert into alert_rules (
         id, user_id, kind, threshold, cooldown_seconds, daily_cap, muted_until
       ) values ($1, $2, 'stale_sync', '{}'::jsonb, 900, 3, $3)`,
      [ruleId, ownerId, '2026-08-26T14:00:00.000Z'],
    );
    await database.client.query(
      `insert into alert_events (
         id, rule_id, snapshot_id, fingerprint, state, evidence
       ) values ($1, $2, $3, 'persisted-alert-evidence', 'breach_confirmed', $4::jsonb)`,
      [
        alertId,
        ruleId,
        '00000000-0000-4000-8000-000000000711',
        JSON.stringify({
          baselineObservationId: 'baseline-snapshot-safe-reference',
          sourceAsOf: '2026-08-25T14:00:20.000Z',
          observedMoney: { amount: '125', currency: 'USD' },
          observedRatio: { value: '0.25' },
          thresholdMoney: { amount: '100', currency: 'USD' },
          thresholdRatio: { value: '0.20' },
          flowAdjustment: { amount: '5', currency: 'USD' },
          quality: {
            freshness: 'fresh',
            coverage: 'complete',
            reconciliation: 'reconciled',
            mixedMarketState: false,
            unsupportedWeight: { value: '0' },
          },
          calculationVersion: 'portfolio-v1',
          scope: { type: 'account', id: 'private-provider-scope-must-not-leak' },
          decisionReason: 'The source exceeded the configured freshness threshold.',
        }),
      ],
    );

    await expect(source.getAlerts()).resolves.toMatchObject({
      alerts: [
        {
          id: alertId,
          mutedUntil: '2026-08-26T14:00:00.000Z',
          evidence: {
            snapshotId: '00000000-0000-4000-8000-000000000711',
            baselineObservationId: 'baseline-snapshot-safe-reference',
            sourceAsOf: '2026-08-25T14:00:20.000Z',
            observedMoney: { amount: '125', currency: 'USD' },
            observedRatio: { value: '0.25' },
            thresholdMoney: { amount: '100', currency: 'USD' },
            thresholdRatio: { value: '0.2' },
            flowAdjustment: { amount: '5', currency: 'USD' },
            quality: {
              freshness: 'fresh',
              coverage: 'complete',
              reconciliation: 'reconciled',
              mixedMarketState: false,
              unsupportedWeight: { value: '0' },
            },
            calculationVersion: 'portfolio-v1',
            scope: { type: 'account' },
            decisionReason:
              'The source exceeded the configured freshness threshold.',
          },
        },
      ],
    });
    expect(JSON.stringify(await source.getAlerts())).not.toContain(
      'private-provider-scope-must-not-leak',
    );
  });

  it('returns a stable unavailable error instead of demo data without last-good state', async () => {
    const database = await createTestDatabase();
    openDatabases.push(database.close);
    const repositories = createRepositories(database.client);
    await repositories.portfolios.createOwner({
      id: '00000000-0000-4000-8000-000000000702',
      email: 'empty-owner@example.test',
    });
    const source = createConnectedReadModelSource({
      database: database.client,
      jobs: repositories.jobs,
      ownerEmail: 'empty-owner@example.test',
    });

    await expect(source.getDashboard()).rejects.toMatchObject({
      code: 'source_unavailable',
      statusCode: 503,
    });
  });

  it('never converts a missing required financial value into zero', async () => {
    const { database, source } = await setupConnectedSource();
    await database.client.query(
      'update account_snapshots set provider_total = null',
    );

    await expect(source.getDashboard()).rejects.toMatchObject({
      code: 'source_unavailable',
      statusCode: 503,
    });
  });

  it('serves all connected routes and queues a read-only refresh job', async () => {
    const { source } = await setupConnectedSource();
    const app = createApi(
      {
        APP_MODE: 'connected',
        NODE_ENV: 'test',
        DATABASE_URL: 'postgresql://localhost/aurum',
        OWNER_CLERK_USER_ID: 'user_owner123',
        OWNER_EMAIL: 'api-owner@example.test',
        WEB_ORIGIN: 'https://portfolio.example.test',
        CLERK_PUBLISHABLE_KEY: 'pk_test_synthetic_public_identity_12345',
        CLERK_ISSUER_URL: 'https://synthetic.clerk.accounts.dev',
        CLERK_SECRET_KEY: 'sk_test_12345678901234567890',
        CSRF_SECRET: 'synthetic-csrf-secret-is-at-least-32-chars',
        ACCOUNT_REFERENCE_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64'),
        ROBINHOOD_OAUTH_ENCRYPTION_KEY: Buffer.alloc(32, 8).toString('base64'),
      },
      {
        repositories: null,
        readModels: source,
        ownerVerifier: {
          verify: async () => ({
            clerkUserId: 'user_owner123',
            email: 'api-owner@example.test',
            emailVerified: true,
            sessionId: 'session-owner',
            authorizedParty: 'https://portfolio.example.test',
            authentication: {
              method: 'passkey' as const,
              verifiedAt: '2026-08-25T14:00:30.000Z',
            },
          }),
        },
      },
    );

    for (const url of [
      '/v1/dashboard',
      '/v1/accounts',
      '/v1/holdings',
      '/v1/performance?range=ALL',
      '/v1/analytics',
      '/v1/activity',
      '/v1/activity/reconciliation',
      '/v1/alerts',
      '/v1/health',
    ]) {
      const response = await app.inject({ method: 'GET', url });
      expect(response.statusCode, `${url}: ${response.body}`).toBe(200);
      expect(response.body, url).not.toContain('Synthetic Demo');
      expect(response.body, url).not.toContain('demo-aurx');
      if (url === '/v1/health') {
        expect(response.json()).toMatchObject({
          data: {
            status: 'ok',
            database: 'ready',
            provider: 'configured',
          },
        });
      }
    }

    const refresh = await app.inject({ method: 'POST', url: '/v1/refresh' });
    expect(refresh.statusCode).toBe(200);
    expect(refresh.json()).toMatchObject({
      data: { state: 'queued', mode: 'connected', jobId: expect.any(String) },
    });
    await app.close();
  });
});
