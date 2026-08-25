import type { PortfolioAccount } from './accounts';
import type { PortfolioAlert } from './alerts';
import type { Money, Ratio } from './money';
import type { PositionObservation } from './observations';
import type { QualityState } from './quality';

export type DataSourceMode = 'demo' | 'connected' | 'disconnected';

export interface DashboardReadModel {
  mode: DataSourceMode;
  portfolioValue: Money | null;
  dailyChange: Money | null;
  dailyChangeRatio: Ratio | null;
  accounts: PortfolioAccount[];
  holdings: PositionObservation[];
  alerts: PortfolioAlert[];
  asOf: string;
  coverage: string;
  freshness: QualityState;
  reconciliationStatus: QualityState;
  calculationVersion: string;
}

export interface ApiEnvelope<T> {
  data: T;
  requestId: string;
  generatedAt: string;
}
