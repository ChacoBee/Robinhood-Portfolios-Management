import { describe, expect, it, vi } from 'vitest';
import { createPostgresAlertEvaluator } from '../../src/alerts/postgres-evaluator';

describe('PostgreSQL promoted-snapshot alert evaluator', () => {
  it('evaluates durable owner rules and persists evidence for the promoted snapshot', async () => {
    const appendEvent = vi.fn();
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [{ total_value: '100', coverage: 'complete', freshness: 'fresh', reconciliation_status: 'reconciled', payload: {} }] })
      .mockResolvedValueOnce({ rows: [{ id: 'rule-1', kind: 'cash_threshold', enabled: true, threshold: { value: '150', scopeId: null }, baseline: null, cooldown_seconds: 300, daily_cap: 1 }] });
    const evaluate = createPostgresAlertEvaluator({ database: { query } as never, alerts: { appendEvent } });

    await evaluate({ userId: 'owner-internal-id', snapshotId: 'snapshot-1', sourceAsOf: '2026-08-26T12:00:00.000Z', calculationVersion: 'v1' });

    expect(appendEvent).toHaveBeenCalledWith(expect.objectContaining({ ruleId: 'rule-1', snapshotId: 'snapshot-1', state: 'breach_confirmed', evidence: expect.objectContaining({ snapshotId: 'snapshot-1' }) }));
  });
});
