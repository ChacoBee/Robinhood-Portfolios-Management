import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AllowedRobinhoodTool } from '../../src/robinhood/read-methods';
import { RobinhoodReadClient } from '../../src/robinhood/client';
import type { McpTransport } from '../../src/robinhood/transport';
import { AesGcmAccountReferenceVault } from '../../src/robinhood/vault';
import { ProviderBoundaryError } from '../../src/robinhood/errors';
import { RefreshService } from '../../src/sync/refresh-service';
import { createRepositories } from '../../src/db/repositories';
import { createTestDatabase } from '../helpers/database';

class MutableFixtureTransport implements McpTransport {
  failTool: AllowedRobinhoodTool | null = null;
  unsafeFailureMessage: string | null = null;

  constructor(
    readonly fixtures: Record<AllowedRobinhoodTool, unknown>,
  ) {}

  async call<T>(tool: AllowedRobinhoodTool): Promise<T> {
    if (this.failTool === tool) {
      if (this.unsafeFailureMessage) {
        throw new Error(this.unsafeFailureMessage);
      }
      throw new ProviderBoundaryError('provider_timeout');
    }
    return this.fixtures[tool] as T;
  }
}

const vault = new AesGcmAccountReferenceVault(
  Buffer.alloc(32, 23).toString('base64'),
);

const baseFixtures: Record<AllowedRobinhoodTool, unknown> = {
  mcp__robinhood__get_accounts: {
    accounts: [
      {
        account_id: 'provider-account-1',
        account_number: '123456789',
        display_name: 'Primary brokerage',
        status: 'active',
        total_kind: 'provider_portfolio_value',
        source_as_of: '2026-08-25T14:00:00.000Z',
      },
    ],
  },
  mcp__robinhood__get_portfolio: {
    account_id: 'provider-account-1',
    total_value: '125',
    cash: '25',
    accrued: '0',
    currency: 'USD',
    source_as_of: '2026-08-25T14:00:20.000Z',
  },
  mcp__robinhood__get_equity_positions: {
    positions: [
      {
        account_id: 'provider-account-1',
        instrument_id: 'synthetic-instrument-1',
        symbol: 'SYN1',
        name: 'Synthetic One',
        asset_class: 'equity',
        quantity: '10',
        market_value: '100',
        cost_basis: '80',
        cost_basis_source: 'provider_average',
        currency: 'USD',
        source_as_of: '2026-08-25T14:00:30.000Z',
      },
    ],
  },
  mcp__robinhood__get_equity_quotes: {
    quotes: [
      {
        instrument_id: 'synthetic-instrument-1',
        symbol: 'SYN1',
        price: '10',
        currency: 'USD',
        market_state: 'regular',
        source_as_of: '2026-08-25T14:00:40.000Z',
      },
    ],
  },
  mcp__robinhood__get_option_positions: { positions: [] },
};

const openDatabases: Array<() => Promise<void>> = [];

afterEach(async () => {
  await Promise.all(openDatabases.splice(0).map((close) => close()));
});

async function setup(
  fixtures = structuredClone(baseFixtures),
  afterSnapshotPromoted?: (input: {
    userId: string;
    snapshotId: string;
    sourceAsOf: string;
    calculationVersion: string;
  }) => Promise<void>,
) {
  const database = await createTestDatabase();
  openDatabases.push(database.close);
  const repositories = createRepositories(database.client, {
    providerIdentifierKeyer: vault,
  });
  const ownerId = '00000000-0000-4000-8000-000000000501';
  await repositories.portfolios.createOwner({
    id: ownerId,
    email: 'refresh-owner@example.test',
  });
  const transport = new MutableFixtureTransport(fixtures);
  const service = new RefreshService({
    client: new RobinhoodReadClient(transport, vault),
    portfolios: repositories.portfolios,
    jobs: repositories.jobs,
    audit: repositories.audit,
    now: () => new Date('2026-08-25T14:01:00.000Z'),
    valuationSession: () => ({
      phase: 'regular',
      lastRegularCloseAt: null,
    }),
    ...(afterSnapshotPromoted ? { afterSnapshotPromoted } : {}),
  });
  return { ownerId, repositories, service, transport, database };
}

describe('coherent Robinhood refresh', () => {
  it('coalesces refresh requests and promotes one coherent snapshot', async () => {
    const { ownerId, repositories, service } = await setup();

    const first = await service.request(ownerId, 'manual');
    const second = await service.request(ownerId, 'heartbeat');
    expect(second.id).toBe(first.id);

    await expect(service.runNext('sync-worker-a')).resolves.toMatchObject({
      state: 'promoted',
      totalValue: '125',
      accountCount: 1,
    });
    await expect(repositories.portfolios.getCurrent(ownerId)).resolves.toMatchObject({
      totalValue: '125',
      coverage: 'complete',
      freshness: 'fresh',
      reconciliationStatus: 'reconciled',
    });
  });

  it('invokes alert evaluation only after the snapshot transaction is promoted', async () => {
    const afterSnapshotPromoted = vi.fn(async () => undefined);
    const { ownerId, service, repositories } = await setup(
      structuredClone(baseFixtures),
      afterSnapshotPromoted,
    );
    await service.request(ownerId, 'manual');

    const result = await service.runNext('sync-worker-a');

    expect(result).toMatchObject({ state: 'promoted' });
    expect(afterSnapshotPromoted).toHaveBeenCalledWith({
      userId: ownerId,
      snapshotId: expect.any(String),
      sourceAsOf: '2026-08-25T14:00:20.000Z',
      calculationVersion: 'portfolio-v1',
    });
    await expect(repositories.portfolios.getCurrent(ownerId)).resolves.not.toBeNull();
  });

  it('preserves the last-good snapshot after a provider failure', async () => {
    const { ownerId, repositories, service, transport } = await setup();
    await service.request(ownerId, 'manual');
    await service.runNext('sync-worker-a');
    const before = await repositories.portfolios.getCurrent(ownerId);

    transport.failTool = 'mcp__robinhood__get_portfolio';
    await service.request(ownerId, 'manual');
    await expect(service.runNext('sync-worker-a')).resolves.toMatchObject({
      state: 'failed',
      reason: 'provider_timeout',
    });

    expect(await repositories.portfolios.getCurrent(ownerId)).toEqual(before);
  });

  it('rejects a snapshot whose source timestamps exceed 120 seconds', async () => {
    const fixtures = structuredClone(baseFixtures);
    const positions = fixtures.mcp__robinhood__get_equity_positions as {
      positions: Array<Record<string, unknown>>;
    };
    positions.positions[0] = {
      ...positions.positions[0],
      source_as_of: '2026-08-25T13:57:59.000Z',
    };
    const { ownerId, repositories, service } = await setup(fixtures);
    await service.request(ownerId, 'scheduled');

    await expect(service.runNext('sync-worker-a')).resolves.toMatchObject({
      state: 'failed',
      reason: 'source_skew_exceeded',
    });
    expect(await repositories.portfolios.getCurrent(ownerId)).toBeNull();
  });

  it('persists normalized observations and snapshot provenance atomically', async () => {
    const { ownerId, repositories, service, database } = await setup();
    await service.request(ownerId, 'manual');
    await service.runNext('sync-worker-a');

    for (const table of [
      'accounts',
      'position_observations',
      'cash_observations',
      'quote_observations',
      'account_snapshots',
      'portfolio_snapshot_accounts',
    ]) {
      const result = await database.raw.query<{ count: string | number }>(
        `select count(*) as count from ${table}`,
      );
      expect(Number(result.rows[0]?.count)).toBe(1);
    }
    const providerKeys = await database.raw.query<{
      provider_instrument_ref: string;
      provenance: unknown;
    }>(
      `select security.provider_instrument_ref, observation.provenance
       from securities security
       join position_observations observation
         on observation.security_id = security.id`,
    );
    expect(JSON.stringify(providerKeys.rows)).not.toContain(
      'synthetic-instrument-1',
    );
    expect(providerKeys.rows[0]?.provider_instrument_ref).toBe(
      vault.stableProviderKey('instrument', 'synthetic-instrument-1'),
    );
    expect(await repositories.portfolios.getCurrent(ownerId)).toMatchObject({
      asOf: '2026-08-25T14:00:20.000Z',
      sourceWindowStart: '2026-08-25T14:00:00.000Z',
      sourceWindowEnd: '2026-08-25T14:00:30.000Z',
      syncCompleteness: 'complete',
    });
  });

  it('maps each account snapshot source window and valuation as-of correctly', async () => {
    const { ownerId, service, database } = await setup();
    await service.request(ownerId, 'manual');
    await service.runNext('sync-worker-a');

    const timestamps = await database.raw.query<{
      source_window_start: string | Date;
      source_window_end: string | Date;
      source_as_of: string | Date;
    }>(
      `select source_window_start, source_window_end, source_as_of
       from account_snapshots`,
    );
    const row = timestamps.rows[0];
    expect(row).toBeDefined();
    expect(new Date(row!.source_window_start).toISOString()).toBe(
      '2026-08-25T14:00:00.000Z',
    );
    expect(new Date(row!.source_window_end).toISOString()).toBe(
      '2026-08-25T14:00:30.000Z',
    );
    expect(new Date(row!.source_as_of).toISOString()).toBe(
      '2026-08-25T14:00:20.000Z',
    );
  });

  it('promotes known USD option value as unsupported detail, never complete equity detail', async () => {
    const fixtures = structuredClone(baseFixtures);
    (fixtures.mcp__robinhood__get_portfolio as Record<string, unknown>).total_value =
      '145';
    fixtures.mcp__robinhood__get_option_positions = {
      positions: [
        {
          account_id: 'provider-account-1',
          option_id: 'synthetic-option-1',
          symbol: 'SYN1 260918C00010000',
          quantity: '1',
          market_value: '20',
          currency: 'USD',
          source_as_of: '2026-08-25T14:00:25.000Z',
        },
      ],
    };
    const { ownerId, repositories, service, database } = await setup(fixtures);
    await service.request(ownerId, 'manual');

    await expect(service.runNext('sync-worker-a')).resolves.toMatchObject({
      state: 'promoted',
      totalValue: '145',
    });
    const current = await repositories.portfolios.getCurrent(ownerId);
    expect(current).toMatchObject({ coverage: 'partial_known_unsupported' });
    expect(current?.payload).toMatchObject({ unsupportedDetailValue: '20' });
    const options = await database.raw.query<{ count: string | number }>(
      'select count(*) as count from option_observations',
    );
    expect(Number(options.rows[0]?.count)).toBe(1);
  });

  it('rejects missing required position values and retains last-good data', async () => {
    const { ownerId, repositories, service, transport } = await setup();
    await service.request(ownerId, 'manual');
    await service.runNext('sync-worker-a');
    const before = await repositories.portfolios.getCurrent(ownerId);
    const positions = transport.fixtures[
      'mcp__robinhood__get_equity_positions'
    ] as { positions: Array<Record<string, unknown>> };
    positions.positions[0] = { ...positions.positions[0], market_value: null };
    await service.request(ownerId, 'manual');

    await expect(service.runNext('sync-worker-a')).resolves.toMatchObject({
      state: 'failed',
      reason: 'position_value_unavailable',
    });
    expect(await repositories.portfolios.getCurrent(ownerId)).toEqual(before);
  });

  it('allows a stale quote without advancing or rejecting provider valuations', async () => {
    const fixtures = structuredClone(baseFixtures);
    const quotes = fixtures.mcp__robinhood__get_equity_quotes as {
      quotes: Array<Record<string, unknown>>;
    };
    quotes.quotes[0] = {
      ...quotes.quotes[0],
      source_as_of: '2026-08-25T13:00:00.000Z',
    };
    const { ownerId, repositories, service } = await setup(fixtures);
    await service.request(ownerId, 'manual');

    await expect(service.runNext('sync-worker-a')).resolves.toMatchObject({
      state: 'promoted',
    });
    expect((await repositories.portfolios.getCurrent(ownerId))?.payload).toMatchObject(
      { quoteFreshness: 'stale' },
    );
  });

  it('deduplicates an identical provider snapshot but audits both runs', async () => {
    const { ownerId, repositories, service, database } = await setup();
    await service.request(ownerId, 'manual');
    await service.runNext('sync-worker-a');
    await service.request(ownerId, 'manual');
    await service.runNext('sync-worker-b');

    expect(await repositories.portfolios.countSnapshots(ownerId)).toBe(1);
    const runs = await database.raw.query<{ count: string | number }>(
      `select count(*) as count
       from sync_runs
       where user_id = $1 and status = 'succeeded'`,
      [ownerId],
    );
    expect(Number(runs.rows[0]?.count)).toBe(2);
  });

  it('rejects an unexplained disappearance of a previously active account', async () => {
    const { ownerId, repositories, service, transport } = await setup();
    await service.request(ownerId, 'manual');
    await service.runNext('sync-worker-a');
    const before = await repositories.portfolios.getCurrent(ownerId);
    transport.fixtures.mcp__robinhood__get_accounts = { accounts: [] };
    await service.request(ownerId, 'scheduled');

    await expect(service.runNext('sync-worker-b')).resolves.toMatchObject({
      state: 'failed',
      reason: 'expected_account_missing',
    });
    expect(await repositories.portfolios.getCurrent(ownerId)).toEqual(before);
  });

  it('stores only a closed failure code when an adapter throws sensitive text', async () => {
    const { ownerId, service, transport, database } = await setup();
    transport.failTool = 'mcp__robinhood__get_accounts';
    transport.unsafeFailureMessage =
      'account 123456789 bearer secret-token provider-account-1';
    await service.request(ownerId, 'manual');

    await expect(service.runNext('sync-worker-a')).resolves.toEqual({
      state: 'failed',
      reason: 'unknown_refresh_failure',
    });
    const evidence = await database.raw.query<{
      failure_reason: string | null;
      last_error: string | null;
      metadata: unknown;
    }>(
      `select sync.failure_reason, job.last_error, audit.metadata
       from sync_runs sync
       cross join jobs job
       cross join audit_events audit
       where sync.user_id = $1
       limit 1`,
      [ownerId],
    );
    const serialized = JSON.stringify(evidence.rows);
    expect(serialized).not.toContain('123456789');
    expect(serialized).not.toContain('secret-token');
    expect(serialized).not.toContain('provider-account-1');
  });
});
