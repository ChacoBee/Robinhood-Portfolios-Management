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
  | 'accrued_missing'
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
  accrued: AvailableMoney;
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
function normalizedAccountType(value: string | null | undefined): string {
  if (!value) return 'Robinhood account';
  return value.replace(/[_-]+/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function mapAccount(account: ProviderAccount, vault: AccountReferenceVault, receivedAt: string): AccountObservation {
  const accountNumber = account.account_number;
  return {
    providerRef: vault.seal(accountNumber), stableKey: vault.stableKey(accountNumber),
    maskedAccountNumber: maskAccountNumber(accountNumber),
    displayName: account.nickname ?? normalizedAccountType(account.account_type),
    status: account.deactivated || account.closed ? 'closed' : 'active',
    totalKind: 'provider_portfolio_value', sourceAsOf: receivedAt,
  };
}
export function mapPortfolio(portfolio: ProviderPortfolioResponse, providerRef: EncryptedAccountReference, stableKey: StableAccountKey, receivedAt: string): AccountValueObservation {
  return { providerRef, stableKey, total: mapProviderMoney(portfolio.total_value, portfolio.currency, 'provider_total_missing'), cash: mapProviderMoney(portfolio.cash, portfolio.currency, 'cash_missing'), accrued: mapProviderMoney(portfolio.accrued, portfolio.currency, 'accrued_missing'), currency: portfolio.currency, sourceAsOf: receivedAt };
}
export function mapEquityPosition(position: ProviderEquityPosition, providerRef: EncryptedAccountReference, stableAccountKey: StableAccountKey, receivedAt: string): EquityPositionObservation {
  if (position.currency !== 'USD') throw new ProviderBoundaryError('provider_schema_drift');
  const costBasis = position.average_buy_price === null ? unavailable('cost_basis_missing') : { state: 'available' as const, value: decimalMoney(new Decimal(position.quantity).mul(position.average_buy_price).toString(), position.currency) };
  return { providerRef, stableAccountKey, instrumentId: position.symbol, symbol: position.symbol, name: position.name ?? position.symbol, assetClass: position.asset_class ?? 'equity', quantity: position.quantity, marketValue: unavailable('provider_market_value_missing'), costBasis, costBasisSource: position.average_buy_price === null ? 'unavailable' : 'provider_average', currency: position.currency, sourceAsOf: receivedAt };
}
export function mapOptionPosition(position: ProviderOptionPosition, providerRef: EncryptedAccountReference, stableAccountKey: StableAccountKey, receivedAt: string): OptionPositionObservation {
  if (position.currency !== 'USD') throw new ProviderBoundaryError('provider_schema_drift');
  return { providerRef, stableAccountKey, optionId: position.option_id, symbol: position.symbol, quantity: position.quantity, marketValue: unavailable('provider_market_value_missing'), currency: position.currency, sourceAsOf: receivedAt };
}
export function mapQuote(quote: ProviderQuote): EquityQuoteObservation {
  const candidates = [
    { price: quote.quote.last_trade_price, timestamp: quote.quote.last_trade_timestamp, marketState: 'regular' as const },
    { price: quote.quote.last_extended_hours_trade_price, timestamp: quote.quote.last_extended_hours_trade_timestamp, marketState: 'extended' as const },
  ].filter((candidate) => candidate.price !== null && candidate.timestamp !== null);
  if (quote.quote.currency !== 'USD' || candidates.length === 0) throw new ProviderBoundaryError('provider_schema_drift');
  const selected = candidates.sort((left, right) => Date.parse(right.timestamp!) - Date.parse(left.timestamp!))[0]!;
  return { instrumentId: quote.symbol, symbol: quote.symbol, price: decimalMoney(selected.price!, quote.quote.currency), currency: quote.quote.currency, marketState: selected.marketState, sourceAsOf: selected.timestamp!, quality: 'complete' };
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
