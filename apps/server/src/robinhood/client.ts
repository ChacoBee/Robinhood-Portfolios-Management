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
  type OptionInstrumentObservation,
  type OptionPositionObservation,
  type OptionQuoteObservation,
} from './mapper';
import {
  ProviderAccountsResponseSchema,
  ProviderEquityPositionsResponseSchema,
  ProviderOptionInstrumentsResponseSchema,
  ProviderOptionPositionsResponseSchema,
  ProviderOptionQuotesResponseSchema,
  ProviderPortfolioResponseSchema,
  ProviderQuotesResponseSchema,
} from './schemas';
import type { ProviderEquityPosition, ProviderOptionPosition } from './schemas';
import type { McpTransport } from './transport';
import type { AccountReferenceVault, EncryptedAccountReference } from './vault';
import { parseProvider, ProviderBoundaryError } from './errors';

export interface QuoteRequest {
  instrumentId: string;
  symbol: string;
}

const batch = <T>(values: readonly T[]): readonly T[][] =>
  Array.from({ length: Math.ceil(values.length / 20) }, (_, index) =>
    values.slice(index * 20, index * 20 + 20),
  );

function assertUnique(values: readonly string[]): void {
  if (new Set(values).size !== values.length) {
    throw new ProviderBoundaryError('provider_schema_drift');
  }
}

function requireRows<T>(rows: readonly (T | null)[]): readonly T[] {
  if (rows.some((row) => row === null)) {
    throw new ProviderBoundaryError('provider_schema_drift');
  }
  return rows as readonly T[];
}

export class RobinhoodReadClient {
  private readonly now: () => Date;

  constructor(
    private readonly transport: McpTransport,
    private readonly vault: AccountReferenceVault,
    now?: () => Date,
  ) {
    this.now = now ?? (() => new Date());
  }

  private receivedAt(): string {
    return this.now().toISOString();
  }

  private async readPages(
    tool: 'get_equity_positions' | 'get_option_positions',
    accountNumber: string,
    nonzero?: true,
  ): Promise<readonly (ProviderEquityPosition | ProviderOptionPosition)[]> {
    const rows: Array<ProviderEquityPosition | ProviderOptionPosition> = []; const cursors = new Set<string>(); let cursor: string | null = null;
    do {
      const raw: unknown = await this.transport.call(tool, {
        account_number: accountNumber, ...(cursor ? { cursor } : {}), ...(nonzero ? { nonzero } : {}),
      });
      const page: { results: Array<ProviderEquityPosition | ProviderOptionPosition | null>; next: string | null } = tool === 'get_equity_positions'
        ? parseProvider(ProviderEquityPositionsResponseSchema, raw)
        : parseProvider(ProviderOptionPositionsResponseSchema, raw);
      rows.push(...requireRows(page.results));
      if (page.next && cursors.has(page.next)) throw new ProviderBoundaryError('provider_schema_drift');
      if (page.next) cursors.add(page.next);
      cursor = page.next;
    } while (cursor);
    return rows;
  }

  async readAccounts(): Promise<readonly AccountObservation[]> {
    const raw = await this.transport.call<unknown>('get_accounts', {});
    const accounts = requireRows(parseProvider(ProviderAccountsResponseSchema, raw).results);
    assertUnique(accounts.map((account) => account.account_number));
    const receivedAt = this.receivedAt();
    return accounts.map((account) => mapAccount(account, this.vault, receivedAt));
  }

  async readPortfolio(accountRef: EncryptedAccountReference): Promise<AccountValueObservation> {
    const accountNumber = this.vault.open(accountRef);
    const raw = await this.transport.call<unknown>('get_portfolio', { account_number: accountNumber });
    return mapPortfolio(parseProvider(ProviderPortfolioResponseSchema, raw), accountRef, this.vault.stableKey(accountNumber), this.receivedAt());
  }

  async readEquityPositions(accountRef: EncryptedAccountReference): Promise<readonly EquityPositionObservation[]> {
    const accountNumber = this.vault.open(accountRef);
    const positions = await this.readPages('get_equity_positions', accountNumber) as readonly ProviderEquityPosition[];
    assertUnique(positions.map((position) => position.symbol));
    const receivedAt = this.receivedAt(); const stableKey = this.vault.stableKey(accountNumber);
    return positions.map((position) => mapEquityPosition(position, accountRef, stableKey, receivedAt));
  }

  async readEquityQuotes(requests: readonly QuoteRequest[]): Promise<readonly EquityQuoteObservation[]> {
    assertUnique(requests.map((request) => request.instrumentId));
    const symbols = [...new Set(requests.map((request) => request.symbol))];
    const quotes: EquityQuoteObservation[] = [];
    for (const symbolsBatch of batch(symbols)) {
      const raw = await this.transport.call<unknown>('get_equity_quotes', { symbols: symbolsBatch });
      const results = requireRows(parseProvider(ProviderQuotesResponseSchema, raw).results);
      quotes.push(...results.map(mapQuote));
    }
    assertUnique(quotes.map((quote) => quote.symbol));
    const requested = new Set(requests.map((request) => request.symbol));
    if (quotes.length !== requested.size || quotes.some((quote) => !requested.has(quote.symbol))) throw new ProviderBoundaryError('provider_schema_drift');
    return quotes;
  }

  async readOptionPositions(accountRef: EncryptedAccountReference): Promise<readonly OptionPositionObservation[]> {
    const accountNumber = this.vault.open(accountRef);
    const positions = await this.readPages('get_option_positions', accountNumber, true) as readonly ProviderOptionPosition[];
    assertUnique(positions.map((position) => position.option_id));
    const receivedAt = this.receivedAt(); const stableKey = this.vault.stableKey(accountNumber);
    return positions.map((position) => mapOptionPosition(position, accountRef, stableKey, receivedAt));
  }

  async readOptionQuotes(optionIds: readonly string[]): Promise<readonly OptionQuoteObservation[]> {
    assertUnique(optionIds); const results: OptionQuoteObservation[] = [];
    for (const optionIdsBatch of batch(optionIds)) {
      const raw = await this.transport.call<unknown>('get_option_quotes', { option_ids: optionIdsBatch });
      const page = requireRows(parseProvider(ProviderOptionQuotesResponseSchema, raw).results);
      for (const row of page) {
        if (row.quote.mark_price === null || row.quote.currency !== 'USD') throw new ProviderBoundaryError('provider_schema_drift');
        results.push({ optionId: row.option_id, markPrice: row.quote.mark_price, currency: row.quote.currency, sourceAsOf: this.receivedAt() });
      }
    }
    assertUnique(results.map((row) => row.optionId));
    if (results.length !== optionIds.length || results.some((row) => !optionIds.includes(row.optionId))) throw new ProviderBoundaryError('provider_schema_drift');
    return results;
  }

  async readOptionInstruments(optionIds: readonly string[]): Promise<readonly OptionInstrumentObservation[]> {
    assertUnique(optionIds); const results: OptionInstrumentObservation[] = [];
    for (const optionIdsBatch of batch(optionIds)) {
      const raw = await this.transport.call<unknown>('get_option_instruments', { option_ids: optionIdsBatch });
      const page = requireRows(parseProvider(ProviderOptionInstrumentsResponseSchema, raw).results);
      for (const row of page) {
        if (row.trade_value_multiplier === null || row.currency !== 'USD') throw new ProviderBoundaryError('provider_schema_drift');
        results.push({ optionId: row.option_id, tradeValueMultiplier: row.trade_value_multiplier, currency: row.currency });
      }
    }
    assertUnique(results.map((row) => row.optionId));
    if (results.length !== optionIds.length || results.some((row) => !optionIds.includes(row.optionId))) throw new ProviderBoundaryError('provider_schema_drift');
    return results;
  }
}
