import type { Money, Ratio } from './money';
import type { Provenance } from './provenance';
import type { QualityState } from './quality';

export type MarketState = 'regular' | 'extended' | 'closed' | 'unknown';

export interface QuoteObservation {
  instrumentId: string;
  price: Money;
  asOf: string;
  marketState: MarketState;
  quality: QualityState;
  provenance: Provenance;
}

export type CostBasisSource =
  | 'provider_average'
  | 'calculated_complete'
  | 'calculated_partial'
  | 'unavailable';

export interface PositionObservation {
  accountId: string;
  instrumentId: string;
  symbol: string;
  name: string;
  assetClass: string;
  quantity: string;
  providerMarketValue: Money | null;
  costBasis: Money | null;
  costBasisSource: CostBasisSource;
  quote: QuoteObservation | null;
  dailyMove: Ratio | null;
  provenance: Provenance;
}

export interface CashObservation {
  accountId: string;
  settledCash: Money | null;
  buyingPower: Money | null;
  accrued: Money | null;
  provenance: Provenance;
}
