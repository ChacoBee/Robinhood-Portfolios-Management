import { randomUUID } from 'node:crypto';
import Decimal from 'decimal.js';
import { ratio, usd, type AlertBaseline, type AlertRuleKind } from '@aurum/domain';
import type { DatabaseClient } from '../db/client';
import type { AlertRepository } from '../db/repositories';
import { evaluateAlertRule } from './evaluate-rule';
import type { AlertEvaluationContext, AlertQualityContext, FactualAlertRule } from './contracts';
import { publicAlertEvidence } from './evidence';

type Input = { userId: string; snapshotId: string; sourceAsOf: string; calculationVersion: string };
type Scalar = { amount: string | number | null };
type Snapshot = { id: string; sync_run_id: string; total_value: string | number; as_of: string | Date; coverage: string; freshness: string; reconciliation_status: string; payload: Record<string, unknown> | string };
type Rule = { id: string; kind: string; enabled: boolean; threshold: Record<string, unknown> | string; baseline: string | null; cooldown_seconds: number; daily_cap: number };
const kinds = new Set<AlertRuleKind>(['data_health_failure', 'stale_sync', 'portfolio_percentage_move', 'holding_percentage_move', 'concentration_threshold', 'cash_threshold', 'material_value_change']);
const ratioKinds = new Set<AlertRuleKind>(['portfolio_percentage_move', 'holding_percentage_move', 'concentration_threshold']);
const baselineKinds = new Set<AlertRuleKind>(['portfolio_percentage_move', 'holding_percentage_move', 'material_value_change']);
const baselines = new Set<AlertBaseline>(['prior_regular_session_close', 'prior_coherent_snapshot', 'fixed_reference']);
const rec = (value: Record<string, unknown> | string) => typeof value === 'string' ? JSON.parse(value) as Record<string, unknown> : value;
function dec(value: string | number | null | undefined): Decimal | null { try { const result = value == null ? null : new Decimal(value); return result?.isFinite() ? result : null; } catch { return null; } }
const money = (value: Decimal | null) => value ? usd(value.toFixed()) : null;
function quality(snapshot: Snapshot): AlertQualityContext {
  const data = rec(snapshot.payload); const q = data.quality && typeof data.quality === 'object' ? data.quality as Record<string, unknown> : {};
  const unsupported = typeof q.unsupportedWeight === 'string' && dec(q.unsupportedWeight) ? q.unsupportedWeight : '1';
  return { freshness: snapshot.freshness === 'fresh' || snapshot.freshness === 'stale' ? snapshot.freshness : 'unknown', coverage: snapshot.coverage === 'complete' ? 'complete' : snapshot.coverage === 'partial_known_unsupported' ? 'partial' : 'unavailable', reconciliation: snapshot.reconciliation_status === 'reconciled' ? 'reconciled' : snapshot.reconciliation_status === 'partial' ? 'partial' : 'unavailable', mixedMarketState: q.mixedMarketState !== false, unsupportedWeight: ratio(unsupported) };
}
function context(input: Input, q: AlertQualityContext): AlertEvaluationContext { return { snapshotId: input.snapshotId, sourceAsOf: input.sourceAsOf, calculationVersion: input.calculationVersion, quality: q, observedMoney: null, observedRatio: null, baselineObservationId: null, baselineMoney: null, flowAdjustment: null, staleForSeconds: null, dataHealthFailure: q.freshness !== 'fresh' || q.coverage !== 'complete' || q.reconciliation !== 'reconciled', suspiciousOutlier: false, coherentConfirmationCount: 0 }; }
function rule(row: Rule): FactualAlertRule {
  if (!kinds.has(row.kind as AlertRuleKind)) throw new Error('alert_rule_invalid');
  const kind = row.kind as AlertRuleKind, threshold = rec(row.threshold), baseline = row.baseline === 'prior_regular_close' ? 'prior_regular_session_close' : row.baseline;
  if (typeof threshold.value !== 'string' || !dec(threshold.value) || (threshold.currency !== undefined && threshold.currency !== 'USD') || (threshold.scopeId !== null && typeof threshold.scopeId !== 'string') || (baselineKinds.has(kind) && !baselines.has(baseline as AlertBaseline)) || (!baselineKinds.has(kind) && baseline !== null)) throw new Error('alert_rule_invalid');
  return { id: row.id, kind, enabled: row.enabled, thresholdMoney: ratioKinds.has(kind) ? null : usd(threshold.value), thresholdRatio: ratioKinds.has(kind) ? ratio(threshold.value) : null, baseline: baseline as AlertBaseline | null, cooldownSeconds: row.cooldown_seconds, dailyCap: row.daily_cap, hysteresisRatio: null, scope: { type: threshold.scopeId === null ? 'portfolio' : kind === 'cash_threshold' ? 'account' : 'holding', id: threshold.scopeId as string | null } };
}

/** Reads factual durable observations; missing required inputs remain null and are suppressed by evaluateAlertRule. */
export function createPostgresAlertEvaluator(options: { database: DatabaseClient; alerts: AlertRepository; now?: () => Date }) {
  const now = options.now ?? (() => new Date());
  return async (input: Input): Promise<void> => {
    const found = await options.database.query<Snapshot>('select id, sync_run_id, total_value, as_of, coverage, freshness, reconciliation_status, payload from portfolio_snapshots where id = $1 and user_id = $2', [input.snapshotId, input.userId]);
    const snapshot = found.rows[0]; if (!snapshot) throw new Error('promoted_snapshot_missing');
    const q = quality(snapshot), rows = await options.database.query<Rule>('select id, kind, enabled, threshold, baseline, cooldown_seconds, daily_cap from alert_rules where user_id = $1', [input.userId]);
    for (const stored of rows.rows) {
      const currentRule = rule(stored), result = context(input, q), total = dec(snapshot.total_value);
      if (currentRule.kind === 'data_health_failure') result.dataHealthFailure = q.freshness !== 'fresh' || q.coverage !== 'complete' || q.reconciliation !== 'reconciled';
      if (currentRule.kind === 'stale_sync') result.staleForSeconds = Number.isFinite(Date.parse(input.sourceAsOf)) ? Math.max(0, Math.floor((now().valueOf() - Date.parse(input.sourceAsOf)) / 1000)) : null;
      if (currentRule.kind === 'cash_threshold') {
        const cash = await options.database.query<Scalar>(currentRule.scope.id ? 'select sum(settled_cash) as amount from cash_observations where sync_run_id = $1 and account_id = $2' : 'select sum(settled_cash) as amount from cash_observations where sync_run_id = $1', currentRule.scope.id ? [snapshot.sync_run_id, currentRule.scope.id] : [snapshot.sync_run_id]);
        result.observedMoney = money(dec(cash.rows[0]?.amount));
      }
      if ((currentRule.kind === 'concentration_threshold' || currentRule.kind === 'holding_percentage_move') && total) {
        const holding = await options.database.query<Scalar>(currentRule.scope.id ? 'select sum(provider_market_value) as amount from position_observations where sync_run_id = $1 and security_id = $2' : 'select max(total) as amount from (select sum(provider_market_value) as total from position_observations where sync_run_id = $1 group by security_id) eligible', currentRule.scope.id ? [snapshot.sync_run_id, currentRule.scope.id] : [snapshot.sync_run_id]);
        const value = dec(holding.rows[0]?.amount); if (value) { result.observedMoney = money(value); result.observedRatio = ratio(value.div(total).toFixed()); }
      }
      if (currentRule.kind === 'portfolio_percentage_move' || currentRule.kind === 'material_value_change') result.observedMoney = money(total);
      if (baselineKinds.has(currentRule.kind) && currentRule.baseline) {
        if (currentRule.baseline === 'fixed_reference') {
          const evaluation = evaluateAlertRule(currentRule, result);
          await options.alerts.appendEvent({ id: randomUUID(), ruleId: evaluation.ruleId, snapshotId: input.snapshotId, fingerprint: evaluation.fingerprint, state: evaluation.state, evidence: publicAlertEvidence(evaluation) });
          continue;
        }
        const history = await options.database.query<Snapshot>(currentRule.baseline === 'prior_regular_session_close' ? 'select id, sync_run_id, total_value, as_of, coverage, freshness, reconciliation_status, payload from portfolio_snapshots where user_id = $1 and as_of < $2 and coverage = \'complete\' and reconciliation_status = \'reconciled\' and freshness = \'fresh\' order by as_of desc limit 1' : 'select id, sync_run_id, total_value, as_of, coverage, freshness, reconciliation_status, payload from portfolio_snapshots where user_id = $1 and as_of < $2 and coverage = \'complete\' and reconciliation_status = \'reconciled\' order by as_of desc limit 1', [input.userId, snapshot.as_of]);
        const prior = history.rows[0];
        if (prior) {
          let current = currentRule.kind === 'holding_percentage_move' ? null : total, baseline = currentRule.kind === 'holding_percentage_move' ? null : dec(prior.total_value);
          if (currentRule.kind === 'holding_percentage_move' && currentRule.scope.id) {
            const [a, b] = await Promise.all([options.database.query<Scalar>('select sum(provider_market_value) as amount from position_observations where sync_run_id = $1 and security_id = $2', [snapshot.sync_run_id, currentRule.scope.id]), options.database.query<Scalar>('select sum(provider_market_value) as amount from position_observations where sync_run_id = $1 and security_id = $2', [prior.sync_run_id, currentRule.scope.id])]);
            current = dec(a.rows[0]?.amount); baseline = dec(b.rows[0]?.amount);
          }
          if (currentRule.kind === 'holding_percentage_move') { current = null; baseline = null; }
          const flows = await options.database.query<Scalar>('select sum(amount) as amount from transactions where user_id = $1 and effective_at > $2 and effective_at <= $3 and kind in (\'deposit\', \'withdrawal\')', [input.userId, prior.as_of, snapshot.as_of]);
          const flow = dec(flows.rows[0]?.amount) ?? new Decimal(0);
          if (current && baseline) { result.baselineObservationId = prior.id; result.flowAdjustment = money(flow); result.baselineMoney = money(baseline.plus(flow)); result.observedMoney = money(current); if (currentRule.kind !== 'material_value_change' && !baseline.isZero()) result.observedRatio = ratio(current.minus(baseline).minus(flow).div(baseline.abs()).toFixed()); }
        }
      }
      const evaluation = evaluateAlertRule(currentRule, result);
      await options.alerts.appendEvent({ id: randomUUID(), ruleId: evaluation.ruleId, snapshotId: input.snapshotId, fingerprint: evaluation.fingerprint, state: evaluation.state, evidence: publicAlertEvidence(evaluation) });
    }
  };
}
