import { describe, expect, it, vi } from 'vitest';
import { ratio } from '@aurum/domain';
import {
  deliverAlert,
  evaluateAlertRule,
  type FactualAlertRule,
  type NotificationEvent,
} from '../../src/alerts';
import { InAppNotificationAdapter } from '../../src/notifications/in-app';
import { ResendEmailAdapter } from '../../src/notifications/resend-email';
import { WebPushAdapter } from '../../src/notifications/web-push';

const rule: FactualAlertRule = {
  id: 'rule-a',
  kind: 'concentration_threshold',
  enabled: true,
  thresholdMoney: null,
  thresholdRatio: ratio('0.2'),
  baseline: 'prior_coherent_snapshot',
  cooldownSeconds: 300,
  dailyCap: 5,
  hysteresisRatio: ratio('0.01'),
  scope: { type: 'holding', id: 'holding-synthetic' },
};

const evaluation = evaluateAlertRule(rule, {
  snapshotId: 'snapshot-a',
  sourceAsOf: '2026-08-25T20:00:00.000Z',
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
  baselineObservationId: 'snapshot-previous',
  baselineMoney: null,
  flowAdjustment: null,
  staleForSeconds: null,
  dataHealthFailure: false,
  suspiciousOutlier: false,
  coherentConfirmationCount: 2,
});

const event: NotificationEvent = {
  id: 'event-a',
  title: 'Concentration threshold observed',
  body: 'Review evidence in Aurum.',
  evidenceUrl: '/alerts/event-a',
  evaluation,
};

describe('notification adapters', () => {
  it('always delivers in-app and shows optional channels as unavailable', async () => {
    const inApp = new InAppNotificationAdapter();
    const results = await deliverAlert(
      event,
      rule,
      [inApp, new ResendEmailAdapter(null, null), new WebPushAdapter(null)],
      [],
      new Date('2026-08-25T20:01:00.000Z'),
    );
    expect(results.map((result) => result.state)).toEqual(['delivered', 'disabled', 'disabled']);
    expect(inApp.events).toEqual([event]);
  });

  it('sends sparse external content without values or identifiers', async () => {
    const send = vi.fn().mockResolvedValue({ id: 'email-a' });
    const adapter = new ResendEmailAdapter({ send }, 'owner@example.test');
    const [result] = await deliverAlert(
      event,
      rule,
      [adapter],
      [],
      new Date('2026-08-25T20:01:00.000Z'),
    );
    expect(result?.state).toBe('delivered');
    const payload = send.mock.calls[0]?.[0] as { text: string };
    expect(payload.text).not.toContain('0.3');
    expect(payload.text).not.toContain('holding-synthetic');
    expect(payload.text).not.toContain('snapshot-a');
  });
});
