import { describe, expect, it } from 'vitest';
import { ratio, usd } from '@aurum/domain';
import {
  evaluateAlertRule,
  type AlertEvaluationContext,
  type FactualAlertRule,
} from '../../../src/alerts';

const rule: FactualAlertRule = {
  id: 'rule-move',
  kind: 'portfolio_percentage_move',
  enabled: true,
  thresholdMoney: null,
  thresholdRatio: ratio('0.05'),
  baseline: 'prior_regular_session_close',
  cooldownSeconds: 3600,
  dailyCap: 3,
  hysteresisRatio: ratio('0.01'),
  scope: { type: 'portfolio', id: null },
};

const context: AlertEvaluationContext = {
  snapshotId: 'snapshot-current',
  sourceAsOf: '2026-08-25T20:00:00.000Z',
  calculationVersion: 'calc-v1',
  quality: {
    freshness: 'fresh',
    coverage: 'complete',
    reconciliation: 'reconciled',
    mixedMarketState: false,
    unsupportedWeight: ratio('0.05'),
  },
  observedMoney: usd('105000'),
  observedRatio: ratio('0.052'),
  baselineObservationId: 'snapshot-baseline',
  baselineMoney: usd('100000'),
  flowAdjustment: usd('0'),
  staleForSeconds: null,
  dataHealthFailure: false,
  suspiciousOutlier: false,
  coherentConfirmationCount: 1,
};

describe('factual alert evaluation', () => {
  it('suppresses financial movement on stale data', () => {
    expect(
      evaluateAlertRule(rule, {
        ...context,
        quality: { ...context.quality, freshness: 'stale' },
      }).state,
    ).toBe('suppressed');
  });

  it('requires a second coherent observation for an outlier', () => {
    expect(
      evaluateAlertRule(rule, { ...context, suspiciousOutlier: true }).state,
    ).toBe('breach_pending_confirmation');
    expect(
      evaluateAlertRule(rule, {
        ...context,
        suspiciousOutlier: true,
        coherentConfirmationCount: 2,
      }).state,
    ).toBe('breach_confirmed');
  });

  it('evaluates data-health and stale-sync rules without suppressing their evidence', () => {
    const unhealthy = evaluateAlertRule(
      {
        ...rule,
        id: 'rule-health',
        kind: 'data_health_failure',
        thresholdRatio: null,
        baseline: null,
      },
      {
        ...context,
        dataHealthFailure: true,
        quality: { ...context.quality, freshness: 'stale', coverage: 'partial' },
      },
    );
    expect(unhealthy.state).toBe('breach_confirmed');

    const stale = evaluateAlertRule(
      {
        ...rule,
        id: 'rule-stale',
        kind: 'stale_sync',
        thresholdRatio: null,
        thresholdMoney: usd('900'),
        baseline: null,
      },
      { ...context, staleForSeconds: 1200 },
    );
    expect(stale.state).toBe('breach_confirmed');
  });

  it('uses named baseline and complete evidence', () => {
    const evaluation = evaluateAlertRule(rule, context);
    expect(evaluation.state).toBe('breach_confirmed');
    expect(evaluation.evidence).toMatchObject({
      snapshotId: 'snapshot-current',
      baselineObservationId: 'snapshot-baseline',
      flowAdjustment: usd('0'),
      calculationVersion: 'calc-v1',
      thresholdRatio: ratio('0.05'),
    });
  });
});
