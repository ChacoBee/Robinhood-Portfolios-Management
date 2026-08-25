import type { AlertBaseline, AlertRuleKind, Money, Ratio } from '@aurum/domain';

export interface FactualAlertRule {
  id: string;
  kind: AlertRuleKind;
  enabled: boolean;
  thresholdMoney: Money | null;
  thresholdRatio: Ratio | null;
  baseline: AlertBaseline | null;
  cooldownSeconds: number;
  dailyCap: number;
  hysteresisRatio: Ratio | null;
  scope: { type: 'portfolio' | 'account' | 'holding'; id: string | null };
}

export interface AlertQualityContext {
  freshness: 'fresh' | 'stale' | 'unknown';
  coverage: 'complete' | 'partial' | 'unsupported' | 'unavailable';
  reconciliation: 'reconciled' | 'partial' | 'unavailable';
  mixedMarketState: boolean;
  unsupportedWeight: Ratio;
}

export interface AlertEvaluationContext {
  snapshotId: string;
  sourceAsOf: string;
  calculationVersion: string;
  quality: AlertQualityContext;
  observedMoney: Money | null;
  observedRatio: Ratio | null;
  baselineObservationId: string | null;
  baselineMoney: Money | null;
  flowAdjustment: Money | null;
  staleForSeconds: number | null;
  dataHealthFailure: boolean;
  suspiciousOutlier: boolean;
  coherentConfirmationCount: number;
}

export type AlertEvaluationState =
  | 'inactive'
  | 'within_threshold'
  | 'suppressed'
  | 'breach_pending_confirmation'
  | 'breach_confirmed';

export interface AlertEvaluation {
  ruleId: string;
  state: AlertEvaluationState;
  fingerprint: string;
  reason: string;
  evidence: {
    snapshotId: string;
    baselineObservationId: string | null;
    sourceAsOf: string;
    observedMoney: Money | null;
    observedRatio: Ratio | null;
    thresholdMoney: Money | null;
    thresholdRatio: Ratio | null;
    flowAdjustment: Money | null;
    quality: AlertQualityContext;
    calculationVersion: string;
    scope: FactualAlertRule['scope'];
  };
}

export interface DeliveryRecord {
  fingerprint: string;
  deliveredAt: string;
  channel: NotificationChannel;
}

export type NotificationChannel = 'in_app' | 'email' | 'web_push';

export interface DeliveryDecision {
  deliver: boolean;
  reason:
    | 'confirmed'
    | 'not_confirmed'
    | 'duplicate'
    | 'cooldown'
    | 'daily_cap'
    | 'muted'
    | 'channel_unavailable';
}

export interface NotificationEvent {
  id: string;
  title: string;
  body: string;
  evidenceUrl: string;
  evaluation: AlertEvaluation;
}

export interface DeliveryResult {
  channel: NotificationChannel;
  state: 'delivered' | 'disabled' | 'failed';
  providerMessageId: string | null;
  reason: string;
}

export interface NotificationAdapter {
  readonly channel: NotificationChannel;
  readonly configured: boolean;
  send(event: NotificationEvent): Promise<DeliveryResult>;
}
