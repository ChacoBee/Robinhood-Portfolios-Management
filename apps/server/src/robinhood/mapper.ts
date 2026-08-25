import { usd, type Money } from '@aurum/domain';
import type { AccountStatus, AccountTotalKind } from '@aurum/domain';
import type {
  ProviderAccount,
  ProviderEquityPosition,
  ProviderOptionPosition,
  ProviderOrder,
  ProviderPnlTrade,
  ProviderPortfolioResponse,
  ProviderQuote,
  ProviderRealizedPnlResponse,
  ProviderTaxLot,
} from './schemas';
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
  | 'realized_pnl_missing'
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
  costBasisSource: ProviderEquityPosition['cost_basis_source'];
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
  marketState: ProviderQuote['market_state'];
  sourceAsOf: string;
  quality: 'complete' | 'unsupported';
}

export interface OrderObservation {
  providerRef: EncryptedAccountReference;
  orderId: string;
  assetType: ProviderOrder['asset_type'];
  state: string;
  side: string;
  quantity: string;
  createdAt: string;
}

export interface TaxLotObservation {
  providerRef: EncryptedAccountReference;
  lotId: string;
  instrumentId: string;
  quantity: string;
  costBasis: AvailableMoney;
  currency: string;
  acquiredAt: string | null;
}

export interface RealizedPnlObservation {
  providerRef: EncryptedAccountReference;
  amount: AvailableMoney;
  currency: string;
  method: string | null;
  sourceAsOf: string;
}

export interface PnlTradeObservation {
  providerRef: EncryptedAccountReference;
  tradeId: string;
  symbol: string;
  amount: AvailableMoney;
  currency: string;
  executedAt: string;
}

export function maskAccountNumber(accountNumber: string | null | undefined) {
  if (!accountNumber) return null;
  const lastFour = accountNumber.replace(/\D/g, '').slice(-4);
  return lastFour ? `•••• ${lastFour.padStart(4, '•')}` : '••••';
}

function mapProviderMoney(
  value: string | null,
  currency: string,
  missingReason: UnavailableMoneyReason,
): AvailableMoney {
  if (value === null) return { state: 'unavailable', reason: missingReason };
  if (currency !== 'USD') {
    return { state: 'unavailable', reason: 'unsupported_currency' };
  }
  return { state: 'available', value: usd(value) };
}

export function mapAccount(
  account: ProviderAccount,
  vault: AccountReferenceVault,
): AccountObservation {
  return {
    providerRef: vault.seal(account.account_id),
    stableKey: vault.stableKey(account.account_id),
    maskedAccountNumber: maskAccountNumber(account.account_number),
    displayName: account.display_name,
    status: account.status,
    totalKind: account.total_kind,
    sourceAsOf: account.source_as_of,
  };
}

export function mapPortfolio(
  portfolio: ProviderPortfolioResponse,
  providerRef: EncryptedAccountReference,
  stableKey: StableAccountKey,
): AccountValueObservation {
  return {
    providerRef,
    stableKey,
    total: mapProviderMoney(
      portfolio.total_value,
      portfolio.currency,
      'provider_total_missing',
    ),
    cash: mapProviderMoney(portfolio.cash, portfolio.currency, 'cash_missing'),
    accrued: mapProviderMoney(portfolio.accrued, portfolio.currency, 'accrued_missing'),
    currency: portfolio.currency,
    sourceAsOf: portfolio.source_as_of,
  };
}

export function mapEquityPosition(
  position: ProviderEquityPosition,
  providerRef: EncryptedAccountReference,
  stableAccountKey: StableAccountKey,
): EquityPositionObservation {
  return {
    providerRef,
    stableAccountKey,
    instrumentId: position.instrument_id,
    symbol: position.symbol,
    name: position.name,
    assetClass: position.asset_class,
    quantity: position.quantity,
    marketValue: mapProviderMoney(
      position.market_value,
      position.currency,
      'provider_market_value_missing',
    ),
    costBasis: mapProviderMoney(
      position.cost_basis,
      position.currency,
      'cost_basis_missing',
    ),
    costBasisSource: position.cost_basis_source,
    currency: position.currency,
    sourceAsOf: position.source_as_of,
  };
}

export function mapOptionPosition(
  position: ProviderOptionPosition,
  providerRef: EncryptedAccountReference,
  stableAccountKey: StableAccountKey,
): OptionPositionObservation {
  return {
    providerRef,
    stableAccountKey,
    optionId: position.option_id,
    symbol: position.symbol,
    quantity: position.quantity,
    marketValue: mapProviderMoney(
      position.market_value,
      position.currency,
      'provider_market_value_missing',
    ),
    currency: position.currency,
    sourceAsOf: position.source_as_of,
  };
}

export function mapQuote(quote: ProviderQuote): EquityQuoteObservation {
  return {
    instrumentId: quote.instrument_id,
    symbol: quote.symbol,
    price: quote.currency === 'USD' ? usd(quote.price) : null,
    currency: quote.currency,
    marketState: quote.market_state,
    sourceAsOf: quote.source_as_of,
    quality: quote.currency === 'USD' ? 'complete' : 'unsupported',
  };
}

export function mapOrder(
  order: ProviderOrder,
  providerRef: EncryptedAccountReference,
): OrderObservation {
  return {
    providerRef,
    orderId: order.order_id,
    assetType: order.asset_type,
    state: order.state,
    side: order.side,
    quantity: order.quantity,
    createdAt: order.created_at,
  };
}

export function mapTaxLot(
  lot: ProviderTaxLot,
  providerRef: EncryptedAccountReference,
): TaxLotObservation {
  return {
    providerRef,
    lotId: lot.lot_id,
    instrumentId: lot.instrument_id,
    quantity: lot.quantity,
    costBasis: mapProviderMoney(lot.cost_basis, lot.currency, 'cost_basis_missing'),
    currency: lot.currency,
    acquiredAt: lot.acquired_at,
  };
}

export function mapRealizedPnl(
  summary: ProviderRealizedPnlResponse,
  providerRef: EncryptedAccountReference,
): RealizedPnlObservation {
  return {
    providerRef,
    amount: mapProviderMoney(summary.amount, summary.currency, 'realized_pnl_missing'),
    currency: summary.currency,
    method: summary.method,
    sourceAsOf: summary.source_as_of,
  };
}

export function mapPnlTrade(
  trade: ProviderPnlTrade,
  providerRef: EncryptedAccountReference,
): PnlTradeObservation {
  return {
    providerRef,
    tradeId: trade.trade_id,
    symbol: trade.symbol,
    amount: mapProviderMoney(trade.amount, trade.currency, 'realized_pnl_missing'),
    currency: trade.currency,
    executedAt: trade.executed_at,
  };
}
