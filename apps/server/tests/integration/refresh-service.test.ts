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
  readonly calls: Array<{ tool: AllowedRobinhoodTool; args: Readonly<Record<string, unknown>> }> = [];
  failTool: AllowedRobinhoodTool | null = null;
  unsafeFailureMessage: string | null = null;

  constructor(readonly fixtures: Record<AllowedRobinhoodTool, unknown>) {}

  async call<T>(tool: AllowedRobinhoodTool, args: Readonly<Record<string, unknown>>): Promise<T> {
    this.calls.push({ tool, args });
    if (this.failTool === tool) {
      if (this.unsafeFailureMessage) throw new Error(this.unsafeFailureMessage);
      throw new ProviderBoundaryError('provider_timeout');
    }
    return this.fixtures[tool] as T;
  }
}

const vault = new AesGcmAccountReferenceVault(Buffer.alloc(32, 23).toString('base64'));
const receivedAt = '2026-08-25T14:01:00.000Z';
const baseFixtures: Record<AllowedRobinhoodTool, unknown> = {
  get_accounts: { results: [{ account_number: '123456789', nickname: 'Primary brokerage', account_type: 'brokerage', deactivated: false, closed: false }] },
  get_portfolio: { total_value: '175', cash: '25', accrued: '0', buying_power: '25', currency: 'USD' },
  get_equity_positions: { results: [{ symbol: 'AAPL', quantity: '1', average_buy_price: '100', currency: 'USD' }], next: null },
  get_equity_quotes: { results: [{ symbol: 'AAPL', quote: { last_trade_price: '125', last_trade_timestamp: '2026-08-25T14:00:30.000Z', last_extended_hours_trade_price: null, last_extended_hours_trade_timestamp: null, currency: 'USD' } }] },
  get_option_positions: { results: [{ option_id: 'option-1', symbol: 'AAPL 260918C00100000', quantity: '1', currency: 'USD' }], next: null },
  get_option_quotes: { results: [{ option_id: 'option-1', quote: { mark_price: '0.25', currency: 'USD' } }] },
  get_option_instruments: { results: [{ option_id: 'option-1', trade_value_multiplier: '100', currency: 'USD' }] },
};

const openDatabases: Array<() => Promise<void>> = [];
afterEach(async () => { await Promise.all(openDatabases.splice(0).map((close) => close())); });

async function setup(
  fixtures = structuredClone(baseFixtures),
  afterSnapshotPromoted?: (input: { userId: string; snapshotId: string; sourceAsOf: string; calculationVersion: string }) => Promise<void>,
) {
  const database = await createTestDatabase();
  openDatabases.push(database.close);
  const repositories = createRepositories(database.client, { providerIdentifierKeyer: vault });
  const ownerId = '00000000-0000-4000-8000-000000000501';
  await repositories.portfolios.createOwner({ id: ownerId, email: 'refresh-owner@example.test' });
  const transport = new MutableFixtureTransport(fixtures);
  const service = new RefreshService({
    client: new RobinhoodReadClient(transport, vault, () => new Date(receivedAt)),
    portfolios: repositories.portfolios, jobs: repositories.jobs, audit: repositories.audit,
    now: () => new Date(receivedAt), valuationSession: () => ({ phase: 'regular', lastRegularCloseAt: null }),
    ...(afterSnapshotPromoted ? { afterSnapshotPromoted } : {}),
  });
  return { database, ownerId, repositories, service, transport };
}

async function runSuccessfulRefresh(service: RefreshService, ownerId: string, worker = 'sync-worker-a') {
  await service.request(ownerId, 'manual');
  return service.runNext(worker);
}

describe('coherent Robinhood refresh', () => {
  it('values live quote payloads before promotion and persists observations atomically', async () => {
    const { database, ownerId, service, transport } = await setup();
    await expect(runSuccessfulRefresh(service, ownerId)).resolves.toMatchObject({ state: 'promoted', totalValue: '175', accountCount: 1 });
    for (const table of ['accounts', 'position_observations', 'cash_observations', 'quote_observations', 'option_observations', 'account_snapshots']) {
      const result = await database.raw.query<{ count: string | number }>(`select count(*) as count from ${table}`);
      expect(Number(result.rows[0]?.count)).toBe(1);
    }
    const positions = await database.raw.query<{ provider_market_value: string }>('select provider_market_value from position_observations');
    expect(positions.rows).toEqual([{ provider_market_value: '125.0000000000' }]);
    expect(transport.calls).toContainEqual({ tool: 'get_option_positions', args: { account_number: '123456789', nonzero: true } });
  });

  it('invokes post-promotion callbacks only after a promoted snapshot', async () => {
    const afterSnapshotPromoted = vi.fn(async () => undefined);
    const { ownerId, repositories, service } = await setup(structuredClone(baseFixtures), afterSnapshotPromoted);
    await expect(runSuccessfulRefresh(service, ownerId)).resolves.toMatchObject({ state: 'promoted' });
    expect(afterSnapshotPromoted).toHaveBeenCalledWith({ userId: ownerId, snapshotId: expect.any(String), sourceAsOf: '2026-08-25T14:00:30.000Z', calculationVersion: 'portfolio-v1' });
    await expect(repositories.portfolios.getCurrent(ownerId)).resolves.not.toBeNull();
  });

  it('preserves the last-good snapshot when a live provider call fails', async () => {
    const { ownerId, repositories, service, transport } = await setup();
    await runSuccessfulRefresh(service, ownerId);
    const before = await repositories.portfolios.getCurrent(ownerId);
    transport.failTool = 'get_portfolio';
    await service.request(ownerId, 'manual');
    await expect(service.runNext('sync-worker-b')).resolves.toEqual({ state: 'failed', reason: 'provider_timeout' });
    expect(await repositories.portfolios.getCurrent(ownerId)).toEqual(before);
  });

  it('rejects source-skewed live quote data before promotion', async () => {
    const fixtures = structuredClone(baseFixtures);
    const quote = (fixtures.get_equity_quotes as { results: Array<{ quote: Record<string, unknown> }> }).results[0]!;
    quote.quote.last_trade_timestamp = '2026-08-25T13:57:59.000Z';
    const { ownerId, repositories, service } = await setup(fixtures);
    await service.request(ownerId, 'scheduled');
    await expect(service.runNext('sync-worker-a')).resolves.toEqual({ state: 'failed', reason: 'source_skew_exceeded' });
    expect(await repositories.portfolios.getCurrent(ownerId)).toBeNull();
  });

  it('preserves last-good data when a quote has no trade valuation', async () => {
    const { ownerId, repositories, service, transport } = await setup();
    await runSuccessfulRefresh(service, ownerId);
    const quote = (transport.fixtures.get_equity_quotes as { results: Array<{ quote: Record<string, unknown> }> }).results[0]!;
    quote.quote.last_trade_price = null;
    quote.quote.last_trade_timestamp = null;
    await service.request(ownerId, 'manual');
    await expect(service.runNext('sync-worker-b')).resolves.toEqual({ state: 'failed', reason: 'provider_schema_drift' });
    expect(await repositories.portfolios.getCurrent(ownerId)).toBeTruthy();
  });

  it('deduplicates an identical live snapshot while recording both runs', async () => {
    const { database, ownerId, repositories, service } = await setup();
    await runSuccessfulRefresh(service, ownerId);
    await runSuccessfulRefresh(service, ownerId, 'sync-worker-b');
    expect(await repositories.portfolios.countSnapshots(ownerId)).toBe(1);
    const runs = await database.raw.query<{ count: string | number }>('select count(*) as count from sync_runs where user_id = $1 and status = \'succeeded\'', [ownerId]);
    expect(Number(runs.rows[0]?.count)).toBe(2);
  });

  it('rejects an unexplained disappearance of an expected account', async () => {
    const { ownerId, repositories, service, transport } = await setup();
    await runSuccessfulRefresh(service, ownerId);
    const before = await repositories.portfolios.getCurrent(ownerId);
    transport.fixtures.get_accounts = { results: [] };
    await service.request(ownerId, 'scheduled');
    await expect(service.runNext('sync-worker-b')).resolves.toEqual({ state: 'failed', reason: 'expected_account_missing' });
    expect(await repositories.portfolios.getCurrent(ownerId)).toEqual(before);
  });

  it('stores only a safe failure code when an adapter error contains provider secrets', async () => {
    const { database, ownerId, service, transport } = await setup();
    transport.failTool = 'get_accounts';
    transport.unsafeFailureMessage = 'account 123456789 bearer secret-token';
    await service.request(ownerId, 'manual');
    await expect(service.runNext('sync-worker-a')).resolves.toEqual({ state: 'failed', reason: 'unknown_refresh_failure' });
    const evidence = await database.raw.query<{ failure_reason: string | null; last_error: string | null; metadata: unknown }>('select sync.failure_reason, job.last_error, audit.metadata from sync_runs sync cross join jobs job cross join audit_events audit where sync.user_id = $1 limit 1', [ownerId]);
    const serialized = JSON.stringify(evidence.rows);
    expect(serialized).not.toContain('123456789');
    expect(serialized).not.toContain('secret-token');
  });
});
