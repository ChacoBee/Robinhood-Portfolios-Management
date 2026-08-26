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

  it('keeps an absent provider accrued value unavailable instead of inventing zero', async () => {
    const accountVault = vault();
    const client = new RobinhoodReadClient(
      new FixtureTransport({
        get_portfolio: [
          {
            total_value: '125',
            cash: '25',
            buying_power: '25',
            currency: 'USD',
          },
        ],
      }),
      accountVault,
    );

    await expect(
      client.readPortfolio(accountVault.seal(rawAccount.account_number)),
    ).resolves.toMatchObject({
      accrued: { state: 'unavailable', reason: 'accrued_missing' },
    });
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

  it('rejects missing, duplicate, unrequested, non-USD, and non-finite equity quotes', async () => {
    const request = [{ instrumentId: 'AAPL', symbol: 'AAPL' }];
    const quote = {
      symbol: 'AAPL',
      quote: {
        last_trade_price: '125',
        last_trade_timestamp: '2026-08-25T14:00:30.000Z',
        last_extended_hours_trade_price: null,
        last_extended_hours_trade_timestamp: null,
        currency: 'USD',
      },
    };
    const cases: unknown[] = [
      { results: [] },
      { results: [quote, quote] },
      { results: [{ ...quote, symbol: 'MSFT' }] },
      { results: [{ ...quote, quote: { ...quote.quote, currency: 'CAD' } }] },
      { results: [{ ...quote, quote: { ...quote.quote, last_trade_price: 'Infinity' } }] },
      {
        results: [
          {
            ...quote,
            quote: {
              ...quote.quote,
              last_trade_price: null,
              last_trade_timestamp: null,
            },
          },
        ],
      },
    ];

    for (const response of cases) {
      const client = new RobinhoodReadClient(
        new FixtureTransport({ get_equity_quotes: [response] }),
        vault(),
      );
      await expect(client.readEquityQuotes(request)).rejects.toThrow(
        'provider_schema_drift',
      );
    }
  });

  it('batches 21 equity symbols in requests of 20', async () => {
    const requests = Array.from({ length: 21 }, (_, index) => ({
      instrumentId: `SYM${index}`,
      symbol: `SYM${index}`,
    }));
    const toResult = ({ symbol }: { symbol: string }) => ({
      symbol,
      quote: {
        last_trade_price: '1',
        last_trade_timestamp: '2026-08-25T14:00:30.000Z',
        last_extended_hours_trade_price: null,
        last_extended_hours_trade_timestamp: null,
        currency: 'USD',
      },
    });
    const transport = new FixtureTransport({
      get_equity_quotes: [
        { results: requests.slice(0, 20).map(toResult) },
        { results: requests.slice(20).map(toResult) },
      ],
    });

    await expect(
      new RobinhoodReadClient(transport, vault()).readEquityQuotes(requests),
    ).resolves.toHaveLength(21);
    expect(transport.calls.map((call) => call.args)).toEqual([
      { symbols: requests.slice(0, 20).map((request) => request.symbol) },
      { symbols: ['SYM20'] },
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

  it('rejects duplicate option positions and invalid option quote or instrument results', async () => {
    const accountVault = vault();
    const reference = accountVault.seal(rawAccount.account_number);
    const duplicatePosition = {
      option_id: 'option-1',
      symbol: 'AAPL 260918C00100000',
      quantity: '1',
      currency: 'USD',
    };
    await expect(
      new RobinhoodReadClient(
        new FixtureTransport({
          get_option_positions: [
            { results: [duplicatePosition, duplicatePosition], next: null },
          ],
        }),
        accountVault,
      ).readOptionPositions(reference),
    ).rejects.toThrow('provider_schema_drift');

    const invalidResponses: Array<Partial<Record<AllowedRobinhoodTool, unknown[]>>> = [
      { get_option_quotes: [{ results: [] }] },
      {
        get_option_quotes: [
          { results: [{ option_id: 'option-2', quote: { mark_price: '1', currency: 'USD' } }] },
        ],
      },
      {
        get_option_quotes: [
          { results: [{ option_id: 'option-1', quote: { mark_price: null, currency: 'USD' } }] },
        ],
      },
      {
        get_option_instruments: [
          { results: [{ option_id: 'option-1', trade_value_multiplier: '100', currency: 'CAD' }] },
        ],
      },
    ];
    for (const responses of invalidResponses) {
      const client = new RobinhoodReadClient(new FixtureTransport(responses), vault());
      const method = responses.get_option_quotes
        ? client.readOptionQuotes(['option-1'])
        : client.readOptionInstruments(['option-1']);
      await expect(method).rejects.toThrow('provider_schema_drift');
    }
  });

  it('batches 21 option IDs for both quote and instrument reads', async () => {
    const optionIds = Array.from({ length: 21 }, (_, index) => `option-${index}`);
    const transport = new FixtureTransport({
      get_option_quotes: [
        { results: optionIds.slice(0, 20).map((option_id) => ({ option_id, quote: { mark_price: '1', currency: 'USD' } })) },
        { results: [{ option_id: 'option-20', quote: { mark_price: '1', currency: 'USD' } }] },
      ],
      get_option_instruments: [
        { results: optionIds.slice(0, 20).map((option_id) => ({ option_id, trade_value_multiplier: '100', currency: 'USD' })) },
        { results: [{ option_id: 'option-20', trade_value_multiplier: '100', currency: 'USD' }] },
      ],
    });
    const client = new RobinhoodReadClient(transport, vault());

    await expect(client.readOptionQuotes(optionIds)).resolves.toHaveLength(21);
    await expect(client.readOptionInstruments(optionIds)).resolves.toHaveLength(21);
    expect(transport.calls.map((call) => call.args)).toEqual([
      { option_ids: optionIds.slice(0, 20) },
      { option_ids: ['option-20'] },
      { option_ids: optionIds.slice(0, 20) },
      { option_ids: ['option-20'] },
    ]);
  });
});
