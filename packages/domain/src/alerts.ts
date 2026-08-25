import type { Money, Ratio } from './money';
import type { QualityState } from './quality';

export type AlertRuleKind =
  | 'data_health_failure'
  | 'stale_sync'
  | 'portfolio_percentage_move'
  | 'holding_percentage_move'
  | 'concentration_threshold'
  | 'cash_threshold'
  | 'material_value_change';

export type AlertBaseline =
  | 'prior_regular_session_close'
  | 'prior_coherent_snapshot'
  | 'fixed_reference';

export interface AlertRule {
  id: string;
  kind: AlertRuleKind;
  enabled: boolean;
  thresholdMoney: Money | null;
  thresholdRatio: Ratio | null;
  baseline: AlertBaseline | null;
  cooldownSeconds: number;
  dailyCap: number;
}

export interface AlertEvidence {
  observedMoney: Money | null;
  observedRatio: Ratio | null;
  baselineObservationId: string | null;
  flowAdjustment: Money | null;
  sourceAsOf: string;
  calculationVersion: string;
  quality: QualityState;
  deliveryDecisionReason: string;
}

export interface PortfolioAlert {
  id: string;
  ruleId: string;
  createdAt: string;
  title: string;
  body: string;
  evidence: AlertEvidence;
  readAt: string | null;
  mutedUntil: string | null;
}
