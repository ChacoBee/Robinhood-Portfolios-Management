import { describe, expect, it } from 'vitest';
import { RobinhoodReadClient } from '../../src/robinhood/client';
import {
  allowedRobinhoodTools,
  assertAllowedRobinhoodTool,
  type AllowedRobinhoodTool,
} from '../../src/robinhood/read-methods';
import {
  PublicDisconnectRequestJsonSchema,
  PublicRefreshRequestJsonSchema,
} from '../../src/robinhood/schemas';
import type { McpTransport } from '../../src/robinhood/transport';
import { AesGcmAccountReferenceVault } from '../../src/robinhood/vault';

class FixtureTransport implements McpTransport {
  readonly calls: Array<{
    tool: AllowedRobinhoodTool;
    args: Readonly<Record<string, unknown>>;
  }> = [];

  constructor(
    private readonly fixtures: Partial<Record<AllowedRobinhoodTool, unknown>>,
  ) {}

  async call<T>(
    tool: AllowedRobinhoodTool,
    args: Readonly<Record<string, unknown>>,
  ): Promise<T> {
    this.calls.push({ tool, args });
    return this.fixtures[tool] as T;
  }
}

const key = Buffer.alloc(32, 7).toString('base64');
const vault = () => new AesGcmAccountReferenceVault(key);

const rawAccount = {
  account_id: 'provider-account-1',
  account_number: '123456789',
  display_name: 'Primary brokerage',
  status: 'active',
  total_kind: 'provider_portfolio_value',
  source_as_of: '2026-08-25T14:00:00.000Z',
} as const;

describe('closed Robinhood read boundary', () => {
  it('contains only the audited read-only tool surface', () => {
    expect(allowedRobinhoodTools).toEqual([
      'mcp__robinhood__get_accounts',
      'mcp__robinhood__get_portfolio',
      'mcp__robinhood__get_equity_positions',
      'mcp__robinhood__get_equity_quotes',
      'mcp__robinhood__get_option_positions',
    ]);

    expect(() =>
      assertAllowedRobinhoodTool('mcp__robinhood__place_equity_order'),
    ).toThrow(/read-only/i);
    expect(() =>
      assertAllowedRobinhoodTool('mcp__robinhood__cancel_option_order'),
    ).toThrow(/read-only/i);
  });

  it('masks numbers and never returns a raw provider account identifier', async () => {
    const transport = new FixtureTransport({
      mcp__robinhood__get_accounts: { accounts: [rawAccount] },
    });
    const result = await new RobinhoodReadClient(transport, vault()).readAccounts();

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      maskedAccountNumber: '•••• 6789',
      displayName: 'Primary brokerage',
      status: 'active',
      totalKind: 'provider_portfolio_value',
    });
    expect(result[0]?.providerRef).toMatch(/^v1\./);
    expect(result[0]?.stableKey).toMatch(/^acct_/);
    expect(JSON.stringify(result)).not.toContain(rawAccount.account_id);
  });

  it('rejects duplicate provider accounts before any fan-out reads', async () => {
    const client = new RobinhoodReadClient(
      new FixtureTransport({
        mcp__robinhood__get_accounts: { accounts: [rawAccount, rawAccount] },
      }),
      vault(),
    );

    await expect(client.readAccounts()).rejects.toThrow('provider_schema_drift');
  });

  it('maps absent provider totals to unavailable instead of zero', async () => {
    const accountVault = vault();
    const reference = accountVault.seal(rawAccount.account_id);
    const client = new RobinhoodReadClient(
      new FixtureTransport({
        mcp__robinhood__get_portfolio: {
          account_id: rawAccount.account_id,
          total_value: null,
          cash: null,
          accrued: null,
          currency: 'USD',
          source_as_of: '2026-08-25T14:00:00.000Z',
        },
      }),
      accountVault,
    );

    const result = await client.readPortfolio(reference);
    expect(result).toMatchObject({
      total: { state: 'unavailable', reason: 'provider_total_missing' },
      cash: { state: 'unavailable', reason: 'cash_missing' },
    });
    expect(JSON.stringify(result)).not.toContain(rawAccount.account_id);
  });

  it('rejects a portfolio or position associated with a different account', async () => {
    const accountVault = vault();
    const reference = accountVault.seal(rawAccount.account_id);
    const client = new RobinhoodReadClient(
      new FixtureTransport({
        mcp__robinhood__get_portfolio: {
          account_id: 'provider-account-2',
          total_value: '10',
          cash: '10',
          accrued: '0',
          currency: 'USD',
          source_as_of: '2026-08-25T14:00:00.000Z',
        },
      }),
      accountVault,
    );

    await expect(client.readPortfolio(reference)).rejects.toThrow(
      'provider_schema_drift',
    );
  });

  it('rejects duplicate positions and unrequested quote identities', async () => {
    const accountVault = vault();
    const reference = accountVault.seal(rawAccount.account_id);
    const position = {
      account_id: rawAccount.account_id,
      instrument_id: 'instrument-1',
      symbol: 'SYN',
      name: 'Synthetic',
      asset_class: 'equity',
      quantity: '1',
      market_value: '10',
      cost_basis: '8',
      cost_basis_source: 'provider_average',
      currency: 'USD',
      source_as_of: '2026-08-25T14:00:00.000Z',
    };
    const client = new RobinhoodReadClient(
      new FixtureTransport({
        mcp__robinhood__get_equity_positions: {
          positions: [position, position],
        },
        mcp__robinhood__get_equity_quotes: {
          quotes: [
            {
              instrument_id: 'instrument-other',
              symbol: 'SYN',
              price: '10',
              currency: 'USD',
              market_state: 'regular',
              source_as_of: '2026-08-25T14:00:00.000Z',
            },
          ],
        },
      }),
      accountVault,
    );

    await expect(client.readEquityPositions(reference)).rejects.toThrow(
      'provider_schema_drift',
    );
    await expect(
      client.readEquityQuotes([{ instrumentId: 'instrument-1', symbol: 'SYN' }]),
    ).rejects.toThrow('provider_schema_drift');
  });

  it('rejects provider payload drift instead of exposing validation details', async () => {
    const client = new RobinhoodReadClient(
      new FixtureTransport({
        mcp__robinhood__get_accounts: {
          accounts: [],
          unexpected_provider_field: 'must fail',
        },
      }),
      vault(),
    );

    await expect(client.readAccounts()).rejects.toThrow('provider_schema_drift');
  });

  it('keeps public request schemas free of generic MCP and credential fields', () => {
    const schemas = [
      PublicRefreshRequestJsonSchema,
      PublicDisconnectRequestJsonSchema,
    ];
    const forbidden = new Set([
      'tool',
      'toolname',
      'method',
      'arguments',
      'accountnumber',
      'credential',
      'credentials',
      'token',
    ]);

    function visit(value: unknown): void {
      if (Array.isArray(value)) {
        value.forEach(visit);
        return;
      }
      if (!value || typeof value !== 'object') return;
      for (const [field, child] of Object.entries(value)) {
        expect(forbidden.has(field.toLowerCase())).toBe(false);
        visit(child);
      }
    }

    schemas.forEach(visit);
  });
});
