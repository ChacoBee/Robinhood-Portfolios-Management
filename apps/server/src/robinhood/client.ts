import {
  mapAccount,
  mapEquityPosition,
  mapOptionPosition,
  mapPortfolio,
  mapQuote,
  type AccountObservation,
  type AccountValueObservation,
  type EquityPositionObservation,
  type EquityQuoteObservation,
} from './mapper';
import {
  ProviderAccountsResponseSchema,
  ProviderEquityPositionsResponseSchema,
  ProviderOptionPositionsResponseSchema,
  ProviderPortfolioResponseSchema,
  ProviderQuotesResponseSchema,
} from './schemas';
import type { McpTransport } from './transport';
import type {
  AccountReferenceVault,
  EncryptedAccountReference,
} from './vault';
import { parseProvider, ProviderBoundaryError } from './errors';

export interface QuoteRequest {
  instrumentId: string;
  symbol: string;
}

function assertAccountMatch(actual: string, expected: string): void {
  if (actual !== expected) {
    throw new ProviderBoundaryError('provider_schema_drift');
  }
}

function assertUnique(values: readonly string[]): void {
  if (new Set(values).size !== values.length) {
    throw new ProviderBoundaryError('provider_schema_drift');
  }
}

export class RobinhoodReadClient {
  constructor(
    private readonly transport: McpTransport,
    private readonly vault: AccountReferenceVault,
  ) {}

  async readAccounts(): Promise<readonly AccountObservation[]> {
    const raw = await this.transport.call<unknown>(
      'mcp__robinhood__get_accounts',
      {},
    );
    const parsed = parseProvider(ProviderAccountsResponseSchema, raw);
    assertUnique(parsed.accounts.map((account) => account.account_id));
    return parsed.accounts.map((account) => mapAccount(account, this.vault));
  }

  async readPortfolio(
    accountRef: EncryptedAccountReference,
  ): Promise<AccountValueObservation> {
    const accountId = this.vault.open(accountRef);
    const raw = await this.transport.call<unknown>(
      'mcp__robinhood__get_portfolio',
      { account_id: accountId },
    );
    const parsed = parseProvider(ProviderPortfolioResponseSchema, raw);
    assertAccountMatch(parsed.account_id, accountId);
    return mapPortfolio(parsed, accountRef, this.vault.stableKey(accountId));
  }

  async readEquityPositions(
    accountRef: EncryptedAccountReference,
  ): Promise<readonly EquityPositionObservation[]> {
    const accountId = this.vault.open(accountRef);
    const raw = await this.transport.call<unknown>(
      'mcp__robinhood__get_equity_positions',
      { account_id: accountId },
    );
    const positions = parseProvider(
      ProviderEquityPositionsResponseSchema,
      raw,
    ).positions;
    positions.forEach((position) =>
      assertAccountMatch(position.account_id, accountId),
    );
    assertUnique(positions.map((position) => position.instrument_id));
    const stableKey = this.vault.stableKey(accountId);
    return positions.map((position) =>
      mapEquityPosition(position, accountRef, stableKey),
    );
  }

  async readEquityQuotes(
    requests: readonly QuoteRequest[],
  ): Promise<readonly EquityQuoteObservation[]> {
    assertUnique(requests.map((request) => request.instrumentId));
    const requestedPairs = new Set(
      requests.map((request) => `${request.instrumentId}\u0000${request.symbol}`),
    );
    const symbols = [...new Set(requests.map((request) => request.symbol))];
    const raw = await this.transport.call<unknown>(
      'mcp__robinhood__get_equity_quotes',
      { symbols },
    );
    const quotes = parseProvider(ProviderQuotesResponseSchema, raw).quotes;
    assertUnique(quotes.map((quote) => quote.instrument_id));
    for (const quote of quotes) {
      if (!requestedPairs.has(`${quote.instrument_id}\u0000${quote.symbol}`)) {
        throw new ProviderBoundaryError('provider_schema_drift');
      }
    }
    return quotes.map(mapQuote);
  }

  async readOptionPositions(accountRef: EncryptedAccountReference) {
    const accountId = this.vault.open(accountRef);
    const raw = await this.transport.call<unknown>(
      'mcp__robinhood__get_option_positions',
      { account_id: accountId },
    );
    const positions = parseProvider(
      ProviderOptionPositionsResponseSchema,
      raw,
    ).positions;
    positions.forEach((position) =>
      assertAccountMatch(position.account_id, accountId),
    );
    assertUnique(positions.map((position) => position.option_id));
    const stableKey = this.vault.stableKey(accountId);
    return positions.map((position) =>
      mapOptionPosition(position, accountRef, stableKey),
    );
  }

}
