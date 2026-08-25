import type { Money } from './money';

export type QualityState =
  | 'complete'
  | 'partial'
  | 'stale'
  | 'unsupported'
  | 'invalid'
  | 'reconciled'
  | 'unavailable';

export type CoverageState = 'complete' | 'partial' | 'unsupported' | 'unavailable';

export type FreshnessState = 'fresh' | 'stale' | 'unknown';

export type ReconciliationState =
  | 'reconciled'
  | 'expected_unsupported_residual'
  | 'timing_difference'
  | 'unexplained_residual'
  | 'not_computable';

export type ResidualKind =
  | 'expected_unsupported'
  | 'timing_difference'
  | 'unexplained';

export interface AccountReconciliation {
  state: ReconciliationState;
  providerTotal: Money | null;
  modeledTotal: Money | null;
  residual: Money | null;
  effectiveTolerance: Money | null;
  headlineEligible: boolean;
  allocationEligible: boolean;
  returnsEligible: boolean;
  reason: string | null;
}

export interface DataStatus {
  coverage: CoverageState;
  freshness: FreshnessState;
  reconciliation: ReconciliationState;
  reasons: string[];
}

export interface MetricQuality {
  state: QualityState;
  reasons: string[];
  calculationVersion: string;
}
