import type { PortfolioAccount } from './accounts';
import type { Money } from './money';
import type { CashObservation, PositionObservation } from './observations';
import type { Provenance } from './provenance';
import type { AccountReconciliation, QualityState } from './quality';

export interface AccountSnapshot {
  id: string;
  account: PortfolioAccount;
  positions: PositionObservation[];
  cash: CashObservation | null;
  reconciliation: AccountReconciliation;
  observedAt: string;
  sourceAsOf: string;
  syncRunId: string;
  quality: QualityState;
}

export interface PortfolioSnapshot {
  id: string;
  accounts: AccountSnapshot[];
  portfolioValue: Money | null;
  asOf: string;
  maxSourceSkewSeconds: number | null;
  coverage: string;
  freshness: QualityState;
  reconciliationStatus: QualityState;
  calculationVersion: string;
  promoted: boolean;
  provenance: Provenance;
}
