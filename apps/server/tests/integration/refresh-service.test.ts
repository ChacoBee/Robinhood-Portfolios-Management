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
  get_accounts: { accounts: [{ account_number: '123456789', rhs_account_number: '987654321', type: 'brokerage', brokerage_account_type: 'individual', is_default: true, agentic_allowed: true, option_level: 'option_level_3', state: 'active', deactivated: false, permanently_deactivated: false, nickname: 'Primary brokerage' }] },
  get_portfolio: { total_value: '175', equity_value: '125', options_value: '25', futures_value: '0', event_contracts_value: '0', crypto_value: '0', cash: '25', pending_deposits: '0', mutual_funds_value: '0', fixed_income_value: '0', currency: 'USD', buying_power: { buying_power: '25', unleveraged_buying_power: '25', display_currency: 'USD' } },
  get_equity_positions: { positions: [{ symbol: 'AAPL', quantity: '1', intraday_quantity: '0', shares_available_for_sells: '1', shares_held_for_sells: '0', shares_held_for_stock_grants: '0', shares_held_for_options_events: '0', shares_held_for_asset_transfer: '0', shares_pending_from_options_events: '0', type: 'equity', average_buy_price: '100' }] },
  get_equity_quotes: { results: [{ quote: { symbol: 'AAPL', last_trade_price: '125', venue_last_trade_time: '2026-08-25T14:00:30.000Z', last_non_reg_trade_price: null, venue_last_non_reg_trade_time: null, adjusted_previous_close: '124', previous_close: '124', previous_close_date: '2026-08-22', bid_price: '124', venue_bid_time: '2026-08-25T14:00:30.000Z', ask_price: '126', venue_ask_time: '2026-08-25T14:00:30.000Z', has_traded: true, state: 'open' } }] },
  get_option_positions: { positions: [{ option_id: 'option-1', chain_id: 'chain-1', chain_symbol: 'AAPL 260918C00100000', type: 'option', quantity: '1', average_price: '0.2', expiration_date: '2026-09-18', trade_value_multiplier: '100', intraday_average_open_price: '0.2', intraday_quantity: '0', pending_buy_quantity: '0', pending_sell_quantity: '0', pending_assignment_quantity: '0', pending_exercise_quantity: '0', pending_expiration_quantity: '0' }] },
  get_option_quotes: { results: [{ quote: { instrument_id: 'option-1', ask_price: '0.26', ask_size: 1, bid_price: '0.24', bid_size: 1, break_even_price: '100.25', adjusted_mark_price: '0.25', mark_price: '0.25', high_fill_rate_buy_price: '0.26', low_fill_rate_buy_price: '0.24', high_fill_rate_sell_price: '0.24', low_fill_rate_sell_price: '0.26', previous_close_price: '0.22', previous_close_date: '2026-08-22', implied_volatility: null, delta: null, gamma: null, rho: null, theta: null, vega: null, open_interest: 1, volume: 1, chance_of_profit_long: null, chance_of_profit_short: null, updated_at: '2026-08-25T14:00:30.000Z' } }] },
  get_option_instruments: { instruments: [{ id: 'option-1', chain_id: 'chain-1', chain_symbol: 'AAPL 260918C00100000', underlying_type: 'equity', expiration_date: '2026-09-18', sellout_datetime: '2026-09-18T20:00:00.000Z', strike_price: '100', type: 'call', state: 'active', tradability: 'tradable', trade_value_multiplier: '100', min_ticks: { above_tick: '0.05', below_tick: '0.01', cutoff_price: '3' } }] },
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
    quote.quote.venue_last_trade_time = '2026-08-25T13:57:59.000Z';
    const { ownerId, repositories, service } = await setup(fixtures);
    await service.request(ownerId, 'scheduled');
    await expect(service.runNext('sync-worker-a')).resolves.toEqual({ state: 'failed', reason: 'source_skew_exceeded' });
    expect(await repositories.portfolios.getCurrent(ownerId)).toBeNull();
  });

  it('fails closed when an internal refresh job has a malformed trigger payload', async () => {
    const { database, ownerId, repositories, service } = await setup();
    await service.request(ownerId, 'scheduled');
    await database.raw.query("update jobs set payload = '{}'::jsonb where user_id = $1", [ownerId]);

    await expect(service.runNext('sync-worker-a')).resolves.toEqual({
      state: 'failed',
      reason: 'unknown_refresh_failure',
    });
    await expect(repositories.portfolios.getCurrent(ownerId)).resolves.toBeNull();
  });

  it('preserves last-good data when a quote has no trade valuation', async () => {
    const { ownerId, repositories, service, transport } = await setup();
    await runSuccessfulRefresh(service, ownerId);
    const quote = (transport.fixtures.get_equity_quotes as { results: Array<{ quote: Record<string, unknown> }> }).results[0]!;
    quote.quote.last_trade_price = null;
    quote.quote.venue_last_trade_time = null;
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
    transport.fixtures.get_accounts = { accounts: [] };
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
