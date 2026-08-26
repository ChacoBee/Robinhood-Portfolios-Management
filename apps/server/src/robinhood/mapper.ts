import Decimal from 'decimal.js';
import {
  usd,
  type AccountStatus,
  type AccountTotalKind,
  type Money,
} from '@aurum/domain';
import type {
  ProviderAccount,
  ProviderEquityPosition,
  ProviderOptionPosition,
  ProviderPortfolioResponse,
  ProviderQuote,
} from './schemas';
import { ProviderBoundaryError } from './errors';
import type {
  AccountReferenceVault,
  EncryptedAccountReference,
  StableAccountKey,
} from './vault';

export type UnavailableMoneyReason =
  | 'provider_total_missing'
  | 'cash_missing'
  | 'buying_power_missing'
  | 'accrued_missing'
  | 'known_unsupported_aggregate_missing'
  | 'provider_market_value_missing'
  | 'cost_basis_missing'
  | 'unsupported_currency';

export type AvailableMoney =
  | { state: 'available'; value: Money }
  | { state: 'unavailable'; reason: UnavailableMoneyReason };

export interface AccountObservation {
  providerRef: EncryptedAccountReference;
  stableKey: StableAccountKey;
  maskedAccountNumber: string | null;
  displayName: string;
  status: AccountStatus;
  totalKind: AccountTotalKind;
  sourceAsOf: string;
}

export interface AccountValueObservation {
  providerRef: EncryptedAccountReference;
  stableKey: StableAccountKey;
  total: AvailableMoney;
  cash: AvailableMoney;
  buyingPower: AvailableMoney;
  accrued: AvailableMoney;
  knownUnsupportedAggregate: AvailableMoney;
  currency: string;
  sourceAsOf: string;
}

export interface EquityPositionObservation {
  providerRef: EncryptedAccountReference;
  stableAccountKey: StableAccountKey;
  instrumentId: string;
  symbol: string;
  name: string;
  assetClass: string;
  quantity: string;
  marketValue: AvailableMoney;
  costBasis: AvailableMoney;
  costBasisSource: 'provider_average' | 'unavailable';
  currency: string;
  sourceAsOf: string;
}

export interface OptionPositionObservation {
  providerRef: EncryptedAccountReference;
  stableAccountKey: StableAccountKey;
  optionId: string;
  symbol: string;
  quantity: string;
  marketValue: AvailableMoney;
  currency: string;
  sourceAsOf: string;
}

export interface EquityQuoteObservation {
  instrumentId: string;
  symbol: string;
  price: Money | null;
  currency: string;
  marketState: 'regular' | 'extended' | 'closed' | 'unknown';
  sourceAsOf: string;
  quality: 'complete' | 'unsupported';
}

export interface OptionQuoteObservation {
  optionId: string;
  markPrice: string;
  currency: string;
  sourceAsOf: string;
}

export interface OptionInstrumentObservation {
  optionId: string;
  tradeValueMultiplier: string;
  currency: string;
}

export function maskAccountNumber(accountNumber: string | null | undefined) {
  if (!accountNumber) return null;
  const lastFour = accountNumber.replace(/\D/g, '').slice(-4);
  return lastFour ? `•••• ${lastFour.padStart(4, '•')}` : '••••';
}

function unavailable(reason: UnavailableMoneyReason): AvailableMoney { return { state: 'unavailable', reason }; }
function decimalMoney(value: string, currency: string): Money {
  if (currency !== 'USD') throw new ProviderBoundaryError('provider_schema_drift');
  const decimal = new Decimal(value);
  if (!decimal.isFinite()) throw new ProviderBoundaryError('provider_schema_drift');
  return usd(decimal.toString());
}
function mapProviderMoney(value: string | null | undefined, currency: string, reason: UnavailableMoneyReason): AvailableMoney {
  if (value === null || value === undefined) return unavailable(reason);
  if (currency !== 'USD') return unavailable('unsupported_currency');
  return { state: 'available', value: decimalMoney(value, currency) };
}
function mapKnownUnsupportedAggregate(portfolio: ProviderPortfolioResponse): AvailableMoney {
  const components = [
    portfolio.futures_value,
    portfolio.event_contracts_value,
    portfolio.crypto_value,
    portfolio.mutual_funds_value,
    portfolio.fixed_income_value,
  ];
  const availableComponents = components.filter(
    (component): component is string => component !== null,
  );
  if (availableComponents.length !== components.length) {
    return unavailable('known_unsupported_aggregate_missing');
  }
  if (portfolio.currency !== 'USD') return unavailable('unsupported_currency');
  const total = availableComponents.reduce(
    (sum, component) => sum.plus(component),
    new Decimal(0),
  );
  return { state: 'available', value: decimalMoney(total.toString(), portfolio.currency) };
}
function normalizedAccountType(value: string | null | undefined): string {
  if (!value) return 'Robinhood account';
  return value.replace(/[_-]+/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function mapAccount(account: ProviderAccount, vault: AccountReferenceVault, receivedAt: string): AccountObservation {
  const accountNumber = account.account_number;
  return {
    providerRef: vault.seal(accountNumber), stableKey: vault.stableKey(accountNumber),
    maskedAccountNumber: maskAccountNumber(accountNumber),
    displayName: account.nickname ?? normalizedAccountType(account.brokerage_account_type || account.type),
    status: account.deactivated || account.permanently_deactivated ? 'closed' : 'active',
    totalKind: 'provider_portfolio_value', sourceAsOf: receivedAt,
  };
}
export function mapPortfolio(portfolio: ProviderPortfolioResponse, providerRef: EncryptedAccountReference, stableKey: StableAccountKey, receivedAt: string): AccountValueObservation {
  return {
    providerRef,
    stableKey,
    total: mapProviderMoney(portfolio.total_value, portfolio.currency, 'provider_total_missing'),
    cash: mapProviderMoney(portfolio.cash, portfolio.currency, 'cash_missing'),
    buyingPower: mapProviderMoney(
      portfolio.buying_power?.buying_power,
      portfolio.buying_power?.display_currency ?? portfolio.currency,
      'buying_power_missing',
    ),
    accrued: mapProviderMoney(portfolio.pending_deposits, portfolio.currency, 'accrued_missing'),
    knownUnsupportedAggregate: mapKnownUnsupportedAggregate(portfolio),
    currency: portfolio.currency,
    sourceAsOf: receivedAt,
  };
}
export function mapEquityPosition(position: ProviderEquityPosition, providerRef: EncryptedAccountReference, stableAccountKey: StableAccountKey, receivedAt: string): EquityPositionObservation {
  const currency = 'USD';
  const costBasis = position.average_buy_price === null || position.average_buy_price === undefined ? unavailable('cost_basis_missing') : { state: 'available' as const, value: decimalMoney(new Decimal(position.quantity).mul(position.average_buy_price).toString(), currency) };
  return { providerRef, stableAccountKey, instrumentId: position.symbol, symbol: position.symbol, name: position.symbol, assetClass: position.type, quantity: position.quantity, marketValue: unavailable('provider_market_value_missing'), costBasis, costBasisSource: position.average_buy_price === null || position.average_buy_price === undefined ? 'unavailable' : 'provider_average', currency, sourceAsOf: receivedAt };
}
export function mapOptionPosition(position: ProviderOptionPosition, providerRef: EncryptedAccountReference, stableAccountKey: StableAccountKey, receivedAt: string): OptionPositionObservation {
  return { providerRef, stableAccountKey, optionId: position.option_id, symbol: position.chain_symbol, quantity: position.quantity, marketValue: unavailable('provider_market_value_missing'), currency: 'USD', sourceAsOf: receivedAt };
}
export function mapQuote(quote: ProviderQuote): EquityQuoteObservation {
  const candidates = [
    { price: quote.quote.last_trade_price, timestamp: quote.quote.venue_last_trade_time, marketState: 'regular' as const },
    { price: quote.quote.last_non_reg_trade_price, timestamp: quote.quote.venue_last_non_reg_trade_time, marketState: 'extended' as const },
  ].filter((candidate) => candidate.price !== null && candidate.timestamp !== null);
  if (!quote.quote.has_traded || candidates.length === 0) throw new ProviderBoundaryError('provider_schema_drift');
  const selected = candidates.sort((left, right) => Date.parse(right.timestamp!) - Date.parse(left.timestamp!))[0]!;
  return { instrumentId: quote.quote.symbol, symbol: quote.quote.symbol, price: decimalMoney(selected.price!, 'USD'), currency: 'USD', marketState: selected.marketState, sourceAsOf: selected.timestamp!, quality: 'complete' };
}
export function valueEquityPositions(positions: readonly EquityPositionObservation[], quotes: readonly EquityQuoteObservation[]): readonly EquityPositionObservation[] {
  const quoteBySymbol = new Map(quotes.map((quote) => [quote.symbol, quote]));
  if (quoteBySymbol.size !== quotes.length) throw new ProviderBoundaryError('provider_schema_drift');
  return positions.map((position) => {
    const quote = quoteBySymbol.get(position.symbol);
    if (!quote?.price || quote.currency !== 'USD' || position.currency !== 'USD') throw new ProviderBoundaryError('provider_schema_drift');
    const value = new Decimal(position.quantity).mul(quote.price.amount);
    if (!value.isFinite()) throw new ProviderBoundaryError('provider_schema_drift');
    return { ...position, marketValue: { state: 'available', value: usd(value.toString()) }, sourceAsOf: quote.sourceAsOf };
  });
}
export function valueOptionPositions(positions: readonly OptionPositionObservation[], quotes: readonly OptionQuoteObservation[], instruments: readonly OptionInstrumentObservation[], receivedAt: string): readonly OptionPositionObservation[] {
  const quoteById = new Map(quotes.map((quote) => [quote.optionId, quote]));
  const instrumentById = new Map(instruments.map((instrument) => [instrument.optionId, instrument]));
  if (quoteById.size !== quotes.length || instrumentById.size !== instruments.length) throw new ProviderBoundaryError('provider_schema_drift');
  return positions.map((position) => {
    const quote = quoteById.get(position.optionId); const instrument = instrumentById.get(position.optionId);
    if (!quote || !instrument || quote.currency !== 'USD' || instrument.currency !== 'USD' || position.currency !== 'USD') throw new ProviderBoundaryError('provider_schema_drift');
    const value = new Decimal(position.quantity).mul(quote.markPrice).mul(instrument.tradeValueMultiplier);
    if (!value.isFinite()) throw new ProviderBoundaryError('provider_schema_drift');
    return { ...position, marketValue: { state: 'available', value: usd(value.toString()) }, sourceAsOf: receivedAt };
  });
}
