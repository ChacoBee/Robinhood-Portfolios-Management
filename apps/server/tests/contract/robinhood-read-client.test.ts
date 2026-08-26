import { describe, expect, it } from 'vitest';
import { RobinhoodReadClient } from '../../src/robinhood/client';
import {
  allowedRobinhoodTools,
  assertAllowedRobinhoodTool,
  type AllowedRobinhoodTool,
} from '../../src/robinhood/read-methods';
import type { McpTransport } from '../../src/robinhood/transport';
import { AesGcmAccountReferenceVault } from '../../src/robinhood/vault';

class FixtureTransport implements McpTransport {
  readonly calls: Array<{
    tool: AllowedRobinhoodTool;
    args: Readonly<Record<string, unknown>>;
  }> = [];

  constructor(
    private readonly responses: Partial<
      Record<AllowedRobinhoodTool, unknown[]>
    >,
  ) {}

  async call<T>(
    tool: AllowedRobinhoodTool,
    args: Readonly<Record<string, unknown>>,
  ): Promise<T> {
    this.calls.push({ tool, args });
    return this.responses[tool]?.shift() as T;
  }
}

const key = Buffer.alloc(32, 7).toString('base64');
const vault = () => new AesGcmAccountReferenceVault(key);

const rawAccount = {
  account_number: '123456789',
  nickname: 'Primary brokerage',
  account_type: 'brokerage',
  deactivated: false,
  closed: false,
} as const;

describe('Robinhood live read contract', () => {
  it('uses only the provider raw read tool names', () => {
    expect(allowedRobinhoodTools).toEqual([
      'get_accounts',
      'get_portfolio',
      'get_equity_positions',
      'get_equity_quotes',
      'get_option_positions',
      'get_option_quotes',
      'get_option_instruments',
    ]);

    expect(() => assertAllowedRobinhoodTool('mcp__robinhood__get_accounts')).toThrow(
      /read-only/i,
    );
    expect(() => assertAllowedRobinhoodTool('place_equity_order')).toThrow(
      /read-only/i,
    );
  });

  it('seals only account_number and stamps an account receipt time', async () => {
    const transport = new FixtureTransport({
      get_accounts: [{ results: [rawAccount] }],
    });
    const result = await new RobinhoodReadClient(
      transport,
      vault(),
      () => new Date('2026-08-25T14:00:00.000Z'),
    ).readAccounts();

    expect(result).toEqual([
      expect.objectContaining({
        maskedAccountNumber: '•••• 6789',
        displayName: 'Primary brokerage',
        status: 'active',
        totalKind: 'provider_portfolio_value',
        sourceAsOf: '2026-08-25T14:00:00.000Z',
      }),
    ]);
    expect(JSON.stringify(result)).not.toContain(rawAccount.account_number);
  });

  it('uses account_number, exhausts position pages once, and rejects a repeated cursor', async () => {
    const accountVault = vault();
    const reference = accountVault.seal(rawAccount.account_number);
    const transport = new FixtureTransport({
      get_equity_positions: [
        {
          results: [
            {
              symbol: 'AAPL',
              quantity: '2',
              average_buy_price: '100',
              currency: 'USD',
            },
          ],
          next: 'cursor-2',
        },
        { results: [], next: null },
      ],
    });
    const client = new RobinhoodReadClient(transport, accountVault);

    await expect(client.readEquityPositions(reference)).resolves.toHaveLength(1);
    expect(transport.calls).toEqual([
      { tool: 'get_equity_positions', args: { account_number: '123456789' } },
      {
        tool: 'get_equity_positions',
        args: { account_number: '123456789', cursor: 'cursor-2' },
      },
    ]);

    const looping = new RobinhoodReadClient(
      new FixtureTransport({
        get_equity_positions: [
          { results: [], next: 'cursor-2' },
          { results: [], next: 'cursor-2' },
        ],
      }),
      accountVault,
    );
    await expect(looping.readEquityPositions(reference)).rejects.toThrow(
      'provider_schema_drift',
    );

    const nullableRow = new RobinhoodReadClient(
      new FixtureTransport({
        get_equity_positions: [{ results: [null], next: null }],
      }),
      accountVault,
    );
    await expect(nullableRow.readEquityPositions(reference)).rejects.toThrow(
      'provider_schema_drift',
    );
  });

  it('maps requested equity quotes from results quote payloads', async () => {
    const transport = new FixtureTransport({
      get_equity_quotes: [
        {
          results: [
            {
              symbol: 'AAPL',
              quote: {
                last_trade_price: '125.50',
                last_trade_timestamp: '2026-08-25T14:00:30.000Z',
                last_extended_hours_trade_price: '126',
                last_extended_hours_trade_timestamp: '2026-08-25T14:01:00.000Z',
                currency: 'USD',
              },
            },
          ],
        },
      ],
    });
    const quotes = await new RobinhoodReadClient(transport, vault()).readEquityQuotes([
      { instrumentId: 'AAPL', symbol: 'AAPL' },
    ]);

    expect(quotes).toEqual([
      expect.objectContaining({
        instrumentId: 'AAPL',
        price: { amount: '126', currency: 'USD' },
        sourceAsOf: '2026-08-25T14:01:00.000Z',
      }),
    ]);
    expect(transport.calls).toEqual([
      { tool: 'get_equity_quotes', args: { symbols: ['AAPL'] } },
    ]);
  });

  it('requests only nonzero option positions', async () => {
    const accountVault = vault();
    const transport = new FixtureTransport({
      get_option_positions: [{ results: [], next: null }],
    });
    const client = new RobinhoodReadClient(transport, accountVault);

    await client.readOptionPositions(accountVault.seal(rawAccount.account_number));
    expect(transport.calls).toEqual([
      {
        tool: 'get_option_positions',
        args: { account_number: '123456789', nonzero: true },
      },
    ]);
  });
});
