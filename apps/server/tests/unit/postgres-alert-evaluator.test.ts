import { describe, expect, it, vi } from 'vitest';
import { createPostgresAlertEvaluator } from '../../src/alerts/postgres-evaluator';

describe('PostgreSQL promoted-snapshot alert evaluator', () => {
  it('evaluates durable owner rules and persists evidence for the promoted snapshot', async () => {
    const appendEvent = vi.fn();
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [{ id: 'snapshot-1', sync_run_id: 'run-1', total_value: '100', as_of: '2026-08-26T12:00:00.000Z', coverage: 'complete', freshness: 'fresh', reconciliation_status: 'reconciled', payload: {} }] })
      .mockResolvedValueOnce({ rows: [{ id: 'rule-1', kind: 'cash_threshold', enabled: true, threshold: { value: '150', scopeId: null }, baseline: null, cooldown_seconds: 300, daily_cap: 1 }] });
    query.mockResolvedValueOnce({ rows: [{ amount: '100' }] });
    const evaluate = createPostgresAlertEvaluator({ database: { query } as never, alerts: { appendEvent } });

    await evaluate({ userId: 'owner-internal-id', snapshotId: 'snapshot-1', sourceAsOf: '2026-08-26T12:00:00.000Z', calculationVersion: 'v1' });

    expect(appendEvent).toHaveBeenCalledWith(expect.objectContaining({ ruleId: 'rule-1', snapshotId: 'snapshot-1', state: 'breach_confirmed', evidence: expect.objectContaining({ snapshotId: 'snapshot-1' }) }));
  });

  it('uses factual durable inputs for every supported rule kind', async () => {
    const appendEvent = vi.fn();
    const kinds = ['data_health_failure', 'stale_sync', 'portfolio_percentage_move', 'holding_percentage_move', 'concentration_threshold', 'cash_threshold', 'material_value_change'];
    const snapshot = { id: 'snapshot-1', sync_run_id: 'run-1', total_value: '120', as_of: '2026-08-26T12:00:00.000Z', coverage: 'complete', freshness: 'fresh', reconciliation_status: 'reconciled', payload: {} };
    const prior = { ...snapshot, id: 'snapshot-0', sync_run_id: 'run-0', total_value: '100', as_of: '2026-08-25T12:00:00.000Z' };
    const query = vi.fn(async (sql: string) => {
      if (sql.includes('where id = $1')) return { rows: [snapshot] };
      if (sql.includes('from alert_rules')) return { rows: kinds.map((kind) => ({ id: `rule-${kind}`, kind, enabled: true, threshold: { value: kind.includes('percentage') || kind === 'concentration_threshold' ? '0.05' : '1', scopeId: kind === 'holding_percentage_move' || kind === 'concentration_threshold' ? 'security-1' : null }, baseline: kind.includes('move') || kind === 'material_value_change' ? 'prior_regular_session_close' : null, cooldown_seconds: 300, daily_cap: 1 })) };
      if (sql.includes('as_of <')) return { rows: [prior] };
      if (sql.includes('transactions')) return { rows: [{ amount: '0' }] };
      return { rows: [{ amount: '60' }] };
    });
    await createPostgresAlertEvaluator({ database: { query } as never, alerts: { appendEvent }, now: () => new Date('2026-08-26T12:10:00.000Z') })({ userId: 'owner', snapshotId: 'snapshot-1', sourceAsOf: snapshot.as_of, calculationVersion: 'v1' });
    expect(appendEvent).toHaveBeenCalledTimes(7);
    expect(appendEvent.mock.calls.map(([event]) => event.ruleId)).toEqual(kinds.map((kind) => `rule-${kind}`));
    expect(appendEvent).toHaveBeenCalledWith(expect.objectContaining({ ruleId: 'rule-cash_threshold', evidence: expect.objectContaining({ observedMoney: { amount: '60', currency: 'USD' } }) }));
    expect(appendEvent).toHaveBeenCalledWith(expect.objectContaining({ ruleId: 'rule-concentration_threshold', evidence: expect.objectContaining({ observedRatio: { value: '0.5' } }) }));
  });
});
