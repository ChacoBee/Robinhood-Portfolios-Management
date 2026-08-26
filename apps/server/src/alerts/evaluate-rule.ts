import { createHash } from 'node:crypto';
import Decimal from 'decimal.js';
import type {
  AlertEvaluation,
  AlertEvaluationContext,
  FactualAlertRule,
} from './contracts';

const financialKinds = new Set([
  'portfolio_percentage_move',
  'holding_percentage_move',
  'concentration_threshold',
  'cash_threshold',
  'material_value_change',
]);

function decimal(value: string | undefined): Decimal | null {
  return value === undefined ? null : new Decimal(value);
}

function evidence(rule: FactualAlertRule, context: AlertEvaluationContext) {
  return {
    snapshotId: context.snapshotId,
    baselineObservationId: context.baselineObservationId,
    sourceAsOf: context.sourceAsOf,
    observedMoney: context.observedMoney,
    observedRatio: context.observedRatio,
    thresholdMoney: rule.thresholdMoney,
    thresholdRatio: rule.thresholdRatio,
    flowAdjustment: context.flowAdjustment,
    quality: context.quality,
    calculationVersion: context.calculationVersion,
    scope: rule.scope,
  };
}

function result(
  rule: FactualAlertRule,
  context: AlertEvaluationContext,
  state: AlertEvaluation['state'],
  reason: string,
): AlertEvaluation {
  const fingerprint = createHash('sha256')
    .update(`${rule.id}|${context.snapshotId}|${state}|${reason}`)
    .digest('base64url');
  return { ruleId: rule.id, state, fingerprint, reason, evidence: evidence(rule, context) };
}

function financialQualityReason(context: AlertEvaluationContext): string | null {
  if (context.quality.freshness !== 'fresh') return 'Snapshot is not fresh';
  if (context.quality.coverage !== 'complete') return 'Snapshot coverage is incomplete';
  if (context.quality.reconciliation !== 'reconciled') return 'Snapshot is not reconciled';
  if (context.quality.mixedMarketState) return 'Snapshot mixes market states';
  if (new Decimal(context.quality.unsupportedWeight.value).gt('0.5')) {
    return 'Unsupported assets dominate the snapshot';
  }
  return null;
}

function thresholdBreached(rule: FactualAlertRule, context: AlertEvaluationContext): boolean {
  switch (rule.kind) {
    case 'data_health_failure':
      return context.dataHealthFailure;
    case 'stale_sync':
      return (
        context.staleForSeconds !== null &&
        rule.thresholdMoney !== null &&
        new Decimal(context.staleForSeconds).gte(rule.thresholdMoney.amount)
      );
    case 'portfolio_percentage_move':
    case 'holding_percentage_move': {
      const observed = decimal(context.observedRatio?.value);
      const threshold = decimal(rule.thresholdRatio?.value);
      return observed !== null && threshold !== null && observed.abs().gte(threshold);
    }
    case 'concentration_threshold': {
      const observed = decimal(context.observedRatio?.value);
      const threshold = decimal(rule.thresholdRatio?.value);
      return observed !== null && threshold !== null && observed.gte(threshold);
    }
    case 'cash_threshold': {
      const observed = decimal(context.observedMoney?.amount);
      const threshold = decimal(rule.thresholdMoney?.amount);
      return observed !== null && threshold !== null && observed.lte(threshold);
    }
    case 'material_value_change': {
      const observed = decimal(context.observedMoney?.amount);
      const baseline = decimal(context.baselineMoney?.amount);
      const threshold = decimal(rule.thresholdMoney?.amount);
      return (
        observed !== null &&
        baseline !== null &&
        threshold !== null &&
        observed.minus(baseline).abs().gte(threshold)
      );
    }
  }
}

export function evaluateAlertRule(
  rule: FactualAlertRule,
  context: AlertEvaluationContext,
): AlertEvaluation {
  if (!rule.enabled) return result(rule, context, 'inactive', 'Rule is disabled');
  if (financialKinds.has(rule.kind)) {
    const qualityReason = financialQualityReason(context);
    if (qualityReason) return result(rule, context, 'suppressed', qualityReason);
  }
  const needsMoney = rule.kind === 'cash_threshold' || rule.kind === 'material_value_change';
  const needsRatio = rule.kind === 'portfolio_percentage_move' || rule.kind === 'holding_percentage_move' || rule.kind === 'concentration_threshold';
  const needsBaseline = rule.kind === 'portfolio_percentage_move' || rule.kind === 'holding_percentage_move' || rule.kind === 'material_value_change';
  if ((needsMoney && context.observedMoney === null) || (needsRatio && context.observedRatio === null) || (needsBaseline && context.baselineMoney === null)) {
    return result(rule, context, 'suppressed', 'Required factual evidence is unavailable');
  }
  if (!thresholdBreached(rule, context)) {
    return result(rule, context, 'within_threshold', 'Observed value is within threshold');
  }
  if (context.suspiciousOutlier && context.coherentConfirmationCount < 2) {
    return result(
      rule,
      context,
      'breach_pending_confirmation',
      'Unverified data anomaly requires a subsequent coherent observation',
    );
  }
  return result(rule, context, 'breach_confirmed', 'Threshold breach confirmed');
}
