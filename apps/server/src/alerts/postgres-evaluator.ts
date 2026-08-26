import { randomUUID } from 'node:crypto';
import { ratio, usd, type AlertRuleKind } from '@aurum/domain';
import type { DatabaseClient } from '../db/client';
import type { AlertRepository } from '../db/repositories';
import { evaluateAlertRule } from './evaluate-rule';
import type { AlertQualityContext, FactualAlertRule } from './contracts';
import { publicAlertEvidence } from './evidence';

type PromotedSnapshot = { userId: string; snapshotId: string; sourceAsOf: string; calculationVersion: string };
const ratioKinds = new Set<AlertRuleKind>(['portfolio_percentage_move', 'holding_percentage_move', 'concentration_threshold']);
const kinds = new Set<AlertRuleKind>(['data_health_failure', 'stale_sync', 'portfolio_percentage_move', 'holding_percentage_move', 'concentration_threshold', 'cash_threshold', 'material_value_change']);

interface SnapshotRow { total_value: string | number; coverage: string; freshness: string; reconciliation_status: string; payload: Record<string, unknown> | string; }
interface RuleRow { id: string; kind: string; enabled: boolean; threshold: Record<string, unknown> | string; baseline: string | null; cooldown_seconds: number; daily_cap: number; }

function object(value: Record<string, unknown> | string): Record<string, unknown> { return typeof value === 'string' ? JSON.parse(value) as Record<string, unknown> : value; }
function quality(value: SnapshotRow): AlertQualityContext {
  const payload = object(value.payload);
  const unsupportedWeight = payload.quality && typeof payload.quality === 'object' && 'unsupportedWeight' in payload.quality && typeof (payload.quality as Record<string, unknown>).unsupportedWeight === 'string' ? (payload.quality as Record<string, unknown>).unsupportedWeight as string : '0';
  const freshness: AlertQualityContext['freshness'] = value.freshness === 'fresh' || value.freshness === 'stale' ? value.freshness : 'unknown';
  return { freshness, coverage: value.coverage === 'complete' ? 'complete' : 'partial', reconciliation: value.reconciliation_status === 'reconciled' ? 'reconciled' : 'partial', mixedMarketState: false, unsupportedWeight: ratio(unsupportedWeight) };
}

/** Evaluates each durable owner rule against a promoted snapshot and persists its evidence. */
export function createPostgresAlertEvaluator(options: { database: DatabaseClient; alerts: AlertRepository }) {
  return async (input: PromotedSnapshot): Promise<void> => {
    const snapshot = await options.database.query<SnapshotRow>('select total_value, coverage, freshness, reconciliation_status, payload from portfolio_snapshots where id = $1 and user_id = $2', [input.snapshotId, input.userId]);
    const current = snapshot.rows[0];
    if (!current) throw new Error('promoted_snapshot_missing');
    const rules = await options.database.query<RuleRow>('select id, kind, enabled, threshold, baseline, cooldown_seconds, daily_cap from alert_rules where user_id = $1', [input.userId]);
    for (const row of rules.rows) {
      if (!kinds.has(row.kind as AlertRuleKind)) throw new Error('alert_rule_invalid');
      const threshold = object(row.threshold);
      if (typeof threshold.value !== 'string') throw new Error('alert_rule_invalid');
      const kind = row.kind as AlertRuleKind;
      const rule: FactualAlertRule = { id: row.id, kind, enabled: row.enabled, thresholdMoney: ratioKinds.has(kind) ? null : usd(threshold.value), thresholdRatio: ratioKinds.has(kind) ? ratio(threshold.value) : null, baseline: row.baseline as FactualAlertRule['baseline'], cooldownSeconds: row.cooldown_seconds, dailyCap: row.daily_cap, hysteresisRatio: null, scope: { type: 'portfolio', id: typeof threshold.scopeId === 'string' ? threshold.scopeId : null } };
      const evaluation = evaluateAlertRule(rule, { snapshotId: input.snapshotId, sourceAsOf: input.sourceAsOf, calculationVersion: input.calculationVersion, quality: quality(current), observedMoney: usd(String(current.total_value)), observedRatio: null, baselineObservationId: null, baselineMoney: null, flowAdjustment: null, staleForSeconds: null, dataHealthFailure: false, suspiciousOutlier: false, coherentConfirmationCount: 0 });
      await options.alerts.appendEvent({ id: randomUUID(), ruleId: evaluation.ruleId, snapshotId: input.snapshotId, fingerprint: evaluation.fingerprint, state: evaluation.state, evidence: publicAlertEvidence(evaluation) });
    }
  };
}
