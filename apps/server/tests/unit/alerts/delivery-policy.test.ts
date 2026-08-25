import { describe, expect, it } from 'vitest';
import { ratio } from '@aurum/domain';
import {
  decideDelivery,
  evaluateAlertRule,
  type FactualAlertRule,
} from '../../../src/alerts';

const rule: FactualAlertRule = {
  id: 'rule-concentration',
  kind: 'concentration_threshold',
  enabled: true,
  thresholdMoney: null,
  thresholdRatio: ratio('0.25'),
  baseline: 'prior_coherent_snapshot',
  cooldownSeconds: 3600,
  dailyCap: 2,
  hysteresisRatio: ratio('0.02'),
  scope: { type: 'holding', id: 'holding-synthetic' },
};

const evaluation = evaluateAlertRule(rule, {
  snapshotId: 'snapshot-a',
  sourceAsOf: '2026-08-25T15:00:00.000Z',
  calculationVersion: 'calc-v1',
  quality: {
    freshness: 'fresh',
    coverage: 'complete',
    reconciliation: 'reconciled',
    mixedMarketState: false,
    unsupportedWeight: ratio('0'),
  },
  observedMoney: null,
  observedRatio: ratio('0.3'),
  baselineObservationId: 'snapshot-before',
  baselineMoney: null,
  flowAdjustment: null,
  staleForSeconds: null,
  dataHealthFailure: false,
  suspiciousOutlier: false,
  coherentConfirmationCount: 2,
});

describe('alert delivery policy', () => {
  it('suppresses a delivery within cooldown', () => {
    const now = new Date('2026-08-25T15:30:00.000Z');
    expect(
      decideDelivery(
        evaluation,
        [{ fingerprint: 'another', deliveredAt: '2026-08-25T15:00:00.000Z', channel: 'email' }],
        now,
        { rule, channel: 'email', channelAvailable: true },
      ),
    ).toEqual({ deliver: false, reason: 'cooldown' });
  });

  it('enforces duplicate suppression and daily caps', () => {
    const now = new Date('2026-08-25T20:00:00.000Z');
    expect(
      decideDelivery(
        evaluation,
        [{ fingerprint: evaluation.fingerprint, deliveredAt: '2026-08-25T10:00:00.000Z', channel: 'email' }],
        now,
        { rule, channel: 'email', channelAvailable: true },
      ).reason,
    ).toBe('duplicate');
    expect(
      decideDelivery(
        evaluation,
        [
          { fingerprint: 'one', deliveredAt: '2026-08-25T10:00:00.000Z', channel: 'email' },
          { fingerprint: 'two', deliveredAt: '2026-08-25T12:00:00.000Z', channel: 'email' },
        ],
        now,
        { rule, channel: 'email', channelAvailable: true },
      ).reason,
    ).toBe('daily_cap');
  });

  it('keeps unavailable channels explicit', () => {
    expect(
      decideDelivery(evaluation, [], new Date('2026-08-25T20:00:00.000Z'), {
        rule,
        channel: 'web_push',
        channelAvailable: false,
      }),
    ).toEqual({ deliver: false, reason: 'channel_unavailable' });
  });
});
