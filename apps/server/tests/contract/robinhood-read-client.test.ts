import { describe, expect, it } from 'vitest';
import { RobinhoodReadClient } from '../../src/robinhood/client';
import { allowedRobinhoodTools, type AllowedRobinhoodTool } from '../../src/robinhood/read-methods';
import type { McpTransport } from '../../src/robinhood/transport';
import { AesGcmAccountReferenceVault } from '../../src/robinhood/vault';

class FixtureTransport implements McpTransport {
  readonly calls: Array<{ tool: AllowedRobinhoodTool; args: Readonly<Record<string, unknown>> }> = [];
  constructor(private readonly responses: Partial<Record<AllowedRobinhoodTool, unknown[]>>) {}
  async call<T>(tool: AllowedRobinhoodTool, args: Readonly<Record<string, unknown>>): Promise<T> {
    this.calls.push({ tool, args });
    return this.responses[tool]?.shift() as T;
  }
}

const vault = () => new AesGcmAccountReferenceVault(Buffer.alloc(32, 7).toString('base64'));
const account = {
  account_number: '123456789', rhs_account_number: '987654321', type: 'brokerage',
  brokerage_account_type: 'individual', is_default: true, agentic_allowed: true,
  option_level: '', state: 'active', deactivated: false,
  permanently_deactivated: false, nickname: 'Primary brokerage',
};
const equityPosition = {
  symbol: 'AAPL', quantity: '2', intraday_quantity: '0', shares_available_for_sells: '2',
  shares_held_for_sells: '0', shares_held_for_stock_grants: '0',
  shares_held_for_options_events: '0', shares_held_for_asset_transfer: '0',
  shares_pending_from_options_events: '0', type: 'equity', average_buy_price: '100',
};
const equityQuote = {
  symbol: 'AAPL', last_trade_price: '125.50', venue_last_trade_time: '2026-08-25T14:00:30.000Z',
  last_non_reg_trade_price: null, venue_last_non_reg_trade_time: null,
  adjusted_previous_close: '124', previous_close: '124', previous_close_date: '2026-08-22',
  bid_price: '125.40', bid_size: '1', ask_price: '125.60', ask_size: '1', has_traded: true,
  state: 'open', updated_at: '2026-08-25T14:00:30.000Z',
};
const optionPosition = {
  option_id: 'option-1', chain_id: 'chain-1', chain_symbol: 'AAPL 260918C00100000', type: 'option',
  quantity: '1', average_price: '0.20', expiration_date: '2026-09-18', trade_value_multiplier: '100',
  intraday_average_open_price: '0.20', intraday_quantity: '0', pending_buy_quantity: '0',
  pending_sell_quantity: '0', pending_assignment_quantity: '0', pending_exercise_quantity: '0',
  pending_expiration_quantity: '0', opened_at: '2026-08-01T14:00:00.000Z',
};
const optionQuote = { instrument_id: 'option-1', mark_price: '0.25', updated_at: '2026-08-25T14:00:30.000Z' };
const optionInstrument = { id: 'option-1', trade_value_multiplier: '100', chain_id: 'chain-1', chain_symbol: 'AAPL 260918C00100000' };

describe('Robinhood live read contract', () => {
  it('keeps the exact seven-tool read allowlist', () => {
    expect(allowedRobinhoodTools).toEqual([
      'get_accounts', 'get_portfolio', 'get_equity_positions', 'get_equity_quotes',
      'get_option_positions', 'get_option_quotes', 'get_option_instruments',
    ]);
  });

  it('maps sanitized live envelopes, uses live argument names, and sends only cursor values', async () => {
    const transport = new FixtureTransport({
      get_accounts: [{ accounts: [account, null] }],
      get_portfolio: [{ total_value: '175', equity_value: '125', options_value: '25', futures_value: '0', event_contracts_value: '0', crypto_value: '0', cash: '25', pending_deposits: '0', mutual_funds_value: '0', fixed_income_value: '0', currency: 'USD', buying_power: { buying_power: '25', unleveraged_buying_power: '25', display_currency: 'USD' } }],
      get_equity_positions: [{ positions: [equityPosition], next: 'https://provider.example/positions?cursor=cursor-2' }, { positions: [] }],
      get_equity_quotes: [{ results: [{ quote: equityQuote, close: false }] }],
      get_option_positions: [{ positions: [optionPosition] }],
      get_option_quotes: [{ results: [{ quote: optionQuote, close: false }] }],
      get_option_instruments: [{ instruments: [optionInstrument] }],
    });
    const client = new RobinhoodReadClient(transport, vault(), () => new Date('2026-08-25T14:01:00.000Z'));
    const accountResult = await client.readAccounts();
    expect(JSON.stringify(accountResult)).not.toContain(account.account_number);
    const reference = accountResult[0]!.providerRef;
    await expect(client.readPortfolio(reference)).resolves.toMatchObject({
      total: { state: 'available', value: { amount: '175', currency: 'USD' } },
      buyingPower: { state: 'available', value: { amount: '25', currency: 'USD' } },
    });
    await expect(client.readEquityPositions(reference)).resolves.toHaveLength(1);
    await expect(client.readEquityQuotes([{ instrumentId: 'AAPL', symbol: 'AAPL' }])).resolves.toMatchObject([{ price: { amount: '125.5', currency: 'USD' }, sourceAsOf: '2026-08-25T14:00:30.000Z' }]);
    await expect(client.readOptionPositions(reference)).resolves.toMatchObject([{ symbol: optionPosition.chain_symbol }]);
    await expect(client.readOptionQuotes(['option-1'])).resolves.toHaveLength(1);
    await expect(client.readOptionInstruments(['option-1'])).resolves.toHaveLength(1);
    expect(transport.calls).toEqual([
      { tool: 'get_accounts', args: {} },
      { tool: 'get_portfolio', args: { account_number: '123456789' } },
      { tool: 'get_equity_positions', args: { account_number: '123456789' } },
      { tool: 'get_equity_positions', args: { account_number: '123456789', cursor: 'cursor-2' } },
      { tool: 'get_equity_quotes', args: { symbols: ['AAPL'] } },
      { tool: 'get_option_positions', args: { account_number: '123456789', nonzero: true } },
      { tool: 'get_option_quotes', args: { instrument_ids: ['option-1'] } },
      { tool: 'get_option_instruments', args: { ids: 'option-1' } },
    ]);
  });

  it('accepts known null account arrays but rejects unexpected fields, malformed numbers, and null required quotes', async () => {
    await expect(new RobinhoodReadClient(new FixtureTransport({ get_accounts: [{ accounts: null }] }), vault()).readAccounts()).resolves.toEqual([]);
    const cases: Array<Partial<Record<AllowedRobinhoodTool, unknown[]>>> = [
      { get_accounts: [{ accounts: [{ ...account, unexpected: true }] }] },
      { get_equity_positions: [{ positions: [{ ...equityPosition, quantity: 'not-a-number' }] }] },
      { get_equity_quotes: [{ results: [{ quote: null, close: false }] }] },
    ];
    for (const responses of cases) {
      const client = new RobinhoodReadClient(new FixtureTransport(responses), vault());
      const operation = responses.get_accounts ? client.readAccounts() : responses.get_equity_positions
        ? client.readEquityPositions(vault().seal('123456789'))
        : client.readEquityQuotes([{ instrumentId: 'AAPL', symbol: 'AAPL' }]);
      await expect(operation).rejects.toThrow('provider_schema_drift');
    }
  });

  it('rejects repeated pagination, duplicate rows, and missing requested option quote or instrument results', async () => {
    const reference = vault().seal('123456789');
    await expect(new RobinhoodReadClient(new FixtureTransport({ get_equity_positions: [{ positions: [], next: 'https://provider.example/?cursor=again' }, { positions: [], next: 'https://provider.example/?cursor=again' }] }), vault()).readEquityPositions(reference)).rejects.toThrow('provider_schema_drift');
    await expect(new RobinhoodReadClient(new FixtureTransport({ get_option_positions: [{ positions: [optionPosition, optionPosition] }] }), vault()).readOptionPositions(reference)).rejects.toThrow('provider_schema_drift');
    await expect(new RobinhoodReadClient(new FixtureTransport({ get_option_quotes: [{ results: [] }] }), vault()).readOptionQuotes(['option-1'])).rejects.toThrow('provider_schema_drift');
    await expect(new RobinhoodReadClient(new FixtureTransport({ get_option_instruments: [{ instruments: [] }] }), vault()).readOptionInstruments(['option-1'])).rejects.toThrow('provider_schema_drift');
  });

  it('batches live quote and instrument argument shapes at twenty identifiers', async () => {
    const optionIds = Array.from({ length: 21 }, (_, index) => `option-${index}`);
    const requests = optionIds.map((optionId) => ({ instrumentId: optionId, symbol: `SYM${optionId}` }));
    const quoteFor = ({ symbol }: { symbol: string }) => ({ ...equityQuote, symbol });
    const optionQuoteFor = (instrument_id: string) => ({ quote: { ...optionQuote, instrument_id } });
    const instrumentFor = (id: string) => ({ ...optionInstrument, id });
    const transport = new FixtureTransport({
      get_equity_quotes: [
        { results: requests.slice(0, 20).map((request) => ({ quote: quoteFor(request) })) },
        { results: [{ quote: quoteFor(requests[20]!) }] },
      ],
      get_option_quotes: [
        { results: optionIds.slice(0, 20).map(optionQuoteFor) },
        { results: [optionQuoteFor(optionIds[20]!)] },
      ],
      get_option_instruments: [
        { instruments: optionIds.slice(0, 20).map(instrumentFor) },
        { instruments: [instrumentFor(optionIds[20]!)] },
      ],
    });
    const client = new RobinhoodReadClient(transport, vault());

    await expect(client.readEquityQuotes(requests)).resolves.toHaveLength(21);
    await expect(client.readOptionQuotes(optionIds)).resolves.toHaveLength(21);
    await expect(client.readOptionInstruments(optionIds)).resolves.toHaveLength(21);
    expect(transport.calls.map((call) => call.args)).toEqual([
      { symbols: requests.slice(0, 20).map((request) => request.symbol) },
      { symbols: [requests[20]!.symbol] },
      { instrument_ids: optionIds.slice(0, 20) },
      { instrument_ids: [optionIds[20]] },
      { ids: optionIds.slice(0, 20).join(',') },
      { ids: optionIds[20] },
    ]);
  });
});
