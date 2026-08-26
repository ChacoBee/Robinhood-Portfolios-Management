import { afterEach, describe, expect, it } from 'vitest';
import type { AllowedRobinhoodTool } from '../../src/robinhood/read-methods';
import { RobinhoodReadClient } from '../../src/robinhood/client';
import type { McpTransport } from '../../src/robinhood/transport';
import { AesGcmAccountReferenceVault } from '../../src/robinhood/vault';
import { RefreshService } from '../../src/sync/refresh-service';
import { createRepositories } from '../../src/db/repositories';
import { createTestDatabase } from '../helpers/database';

class FixtureTransport implements McpTransport {
  readonly calls: Array<{ tool: AllowedRobinhoodTool; args: Readonly<Record<string, unknown>> }> = [];

  constructor(readonly fixtures: Record<AllowedRobinhoodTool, unknown>) {}

  async call<T>(tool: AllowedRobinhoodTool, args: Readonly<Record<string, unknown>>): Promise<T> {
    this.calls.push({ tool, args });
    return this.fixtures[tool] as T;
  }
}

const vault = new AesGcmAccountReferenceVault(
  Buffer.alloc(32, 23).toString('base64'),
);
const receivedAt = '2026-08-25T14:01:00.000Z';
const fixtures: Record<AllowedRobinhoodTool, unknown> = {
  get_accounts: {
    results: [{ account_number: '123456789', nickname: 'Primary brokerage', account_type: 'brokerage', deactivated: false, closed: false }],
  },
  get_portfolio: { total_value: '175', cash: '25', accrued: '0', buying_power: '25', currency: 'USD' },
  get_equity_positions: {
    results: [{ symbol: 'AAPL', quantity: '1', average_buy_price: '100', currency: 'USD' }],
    next: null,
  },
  get_equity_quotes: {
    results: [{ symbol: 'AAPL', quote: { last_trade_price: '125', last_trade_timestamp: '2026-08-25T14:00:30.000Z', last_extended_hours_trade_price: null, last_extended_hours_trade_timestamp: null, currency: 'USD' } }],
  },
  get_option_positions: {
    results: [{ option_id: 'option-1', symbol: 'AAPL 260918C00100000', quantity: '1', currency: 'USD' }],
    next: null,
  },
  get_option_quotes: { results: [{ option_id: 'option-1', quote: { mark_price: '0.25', currency: 'USD' } }] },
  get_option_instruments: { results: [{ option_id: 'option-1', trade_value_multiplier: '100', currency: 'USD' }] },
};

const openDatabases: Array<() => Promise<void>> = [];

afterEach(async () => {
  await Promise.all(openDatabases.splice(0).map((close) => close()));
});

describe('coherent Robinhood refresh', () => {
  it('values paged positions from live quote payloads before promotion', async () => {
    const database = await createTestDatabase();
    openDatabases.push(database.close);
    const repositories = createRepositories(database.client, { providerIdentifierKeyer: vault });
    const ownerId = '00000000-0000-4000-8000-000000000501';
    await repositories.portfolios.createOwner({ id: ownerId, email: 'refresh-owner@example.test' });
    const transport = new FixtureTransport(structuredClone(fixtures));
    const service = new RefreshService({
      client: new RobinhoodReadClient(transport, vault, () => new Date(receivedAt)),
      portfolios: repositories.portfolios,
      jobs: repositories.jobs,
      audit: repositories.audit,
      now: () => new Date(receivedAt),
      valuationSession: () => ({ phase: 'regular', lastRegularCloseAt: null }),
    });

    await service.request(ownerId, 'manual');
    const result = await service.runNext('sync-worker-a');
    expect(result).toEqual({
      state: 'promoted', snapshotId: expect.any(String), totalValue: '175', accountCount: 1,
    });
    const positions = await database.raw.query<{ provider_market_value: string }>(
      'select provider_market_value from position_observations',
    );
    expect(positions.rows).toEqual([{ provider_market_value: '125.0000000000' }]);
    const options = await database.raw.query<{ provider_market_value: string }>(
      'select provider_market_value from option_observations',
    );
    expect(options.rows).toEqual([{ provider_market_value: '25.0000000000' }]);
    expect(transport.calls).toContainEqual({
      tool: 'get_option_positions',
      args: { account_number: '123456789', nonzero: true },
    });
  });
});
