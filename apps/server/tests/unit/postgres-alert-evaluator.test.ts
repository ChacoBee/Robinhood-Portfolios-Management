import { describe, expect, it, vi } from 'vitest';
import { usd } from '@aurum/domain';
import { createPostgresAlertEvaluator } from '../../src/alerts/postgres-evaluator';
import {
  buildSnapshotPromotion,
  type AccountRefreshBundle,
} from '../../src/sync/snapshot-promotion';

function promotedSnapshot(input: {
  id: string;
  syncRunId: string;
  total: string;
  asOf: string;
}) {
  const bundle: AccountRefreshBundle = {
    account: {
      providerRef: 'sealed-account' as never,
      stableKey: 'account-1' as never,
      maskedAccountNumber: null,
      displayName: 'Taxable',
      status: 'active',
      totalKind: 'net_liquidation_value',
      sourceAsOf: input.asOf,
    },
    portfolio: {
      providerRef: 'sealed-account' as never,
      stableKey: 'account-1' as never,
      total: { state: 'available', value: usd(input.total) },
      cash: { state: 'available', value: usd(input.total) },
      buyingPower: { state: 'available', value: usd(input.total) },
      accrued: { state: 'available', value: usd('0') },
      currency: 'USD',
      sourceAsOf: input.asOf,
    },
    equityPositions: [],
    optionPositions: [],
    quotes: [{
      instrumentId: 'instrument-1',
      symbol: 'AURUM',
      price: usd('1'),
      currency: 'USD',
      marketState: 'extended',
      sourceAsOf: input.asOf,
      quality: 'complete',
    }],
  };
  const promotion = buildSnapshotPromotion({
    syncRunId: input.syncRunId,
    bundles: [bundle],
    receivedAt: input.asOf,
    trigger: 'scheduled',
    phase: 'extended',
    lastRegularCloseAt: input.asOf.replace(/T20:05:00.000Z$/, 'T20:00:00.000Z'),
  });
  return {
    id: input.id,
    sync_run_id: input.syncRunId,
    total_value: promotion.totalValue.amount,
    as_of: promotion.asOf,
    coverage: promotion.coverage,
    freshness: promotion.freshness,
    reconciliation_status: promotion.reconciliationStatus,
    payload: promotion.payload,
  };
}

describe('PostgreSQL promoted-snapshot alert evaluator', () => {
  it('evaluates durable owner rules and persists evidence for the promoted snapshot', async () => {
    const appendEvent = vi.fn();
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [{ id: 'snapshot-1', sync_run_id: 'run-1', total_value: '100', as_of: '2026-08-26T12:00:00.000Z', coverage: 'complete', freshness: 'fresh', reconciliation_status: 'reconciled', payload: { quality: { mixedMarketState: false, unsupportedWeight: '0' } } }] })
      .mockResolvedValueOnce({ rows: [{ id: 'rule-1', kind: 'cash_threshold', enabled: true, threshold: { value: '150', scopeId: null }, baseline: null, cooldown_seconds: 300, daily_cap: 1 }] });
    query.mockResolvedValueOnce({ rows: [{ amount: '100' }] });
    const evaluate = createPostgresAlertEvaluator({ database: { query } as never, alerts: { appendEvent } });

    await evaluate({ userId: 'owner-internal-id', snapshotId: 'snapshot-1', sourceAsOf: '2026-08-26T12:00:00.000Z', calculationVersion: 'v1' });

    expect(appendEvent).toHaveBeenCalledWith(expect.objectContaining({ ruleId: 'rule-1', snapshotId: 'snapshot-1', state: 'breach_confirmed', evidence: expect.objectContaining({ snapshotId: 'snapshot-1' }) }));
  });

  it('uses factual durable inputs for every supported rule kind', async () => {
    const appendEvent = vi.fn();
    const kinds = ['data_health_failure', 'stale_sync', 'portfolio_percentage_move', 'holding_percentage_move', 'concentration_threshold', 'cash_threshold', 'material_value_change'];
    const snapshot = { id: 'snapshot-1', sync_run_id: 'run-1', total_value: '120', as_of: '2026-08-26T12:00:00.000Z', coverage: 'complete', freshness: 'fresh', reconciliation_status: 'reconciled', payload: { quality: { mixedMarketState: false, unsupportedWeight: '0' } } };
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
    const events = new Map(appendEvent.mock.calls.map(([event]) => [event.ruleId, event]));
    expect(events.get('rule-data_health_failure')).toMatchObject({ state: 'within_threshold', evidence: { observedMoney: null, observedRatio: null, baselineObservationId: null, scope: { type: 'portfolio', id: null } } });
    expect(events.get('rule-stale_sync')).toMatchObject({ state: 'breach_confirmed', evidence: { observedMoney: null, observedRatio: null, baselineObservationId: null, scope: { type: 'portfolio', id: null } } });
    expect(events.get('rule-portfolio_percentage_move')).toMatchObject({ state: 'breach_confirmed', evidence: { observedMoney: { amount: '120', currency: 'USD' }, observedRatio: { value: '0.2' }, baselineObservationId: 'snapshot-0', scope: { type: 'portfolio', id: null } } });
    expect(events.get('rule-holding_percentage_move')).toMatchObject({ state: 'within_threshold', evidence: { observedMoney: { amount: '60', currency: 'USD' }, observedRatio: { value: '0' }, baselineObservationId: 'snapshot-0', scope: { type: 'holding', id: 'security-1' } } });
    expect(events.get('rule-concentration_threshold')).toMatchObject({ state: 'breach_confirmed', evidence: { observedMoney: { amount: '60', currency: 'USD' }, observedRatio: { value: '0.5' }, baselineObservationId: null, scope: { type: 'holding', id: 'security-1' } } });
    expect(events.get('rule-cash_threshold')).toMatchObject({ state: 'within_threshold', evidence: { observedMoney: { amount: '60', currency: 'USD' }, observedRatio: null, baselineObservationId: null, scope: { type: 'portfolio', id: null } } });
    expect(events.get('rule-material_value_change')).toMatchObject({ state: 'breach_confirmed', evidence: { observedMoney: { amount: '120', currency: 'USD' }, observedRatio: null, baselineObservationId: 'snapshot-0', scope: { type: 'portfolio', id: null } } });
  });

  it.each([['0', 'suppressed', null], ['30', 'breach_confirmed', '1']])('uses only exact holding history when prior value is %s', async (priorValue, state, observedRatio) => {
    const appendEvent = vi.fn();
    const current = { id: 'current', sync_run_id: 'run-current', total_value: '120', as_of: '2026-08-26T12:00:00.000Z', coverage: 'complete', freshness: 'fresh', reconciliation_status: 'reconciled', payload: { quality: { mixedMarketState: false, unsupportedWeight: '0' } } };
    const prior = { ...current, id: 'prior', sync_run_id: 'run-prior', total_value: '100', as_of: '2026-08-25T12:00:00.000Z' };
    const query = vi.fn(async (sql: string, params?: readonly unknown[]) => {
      if (sql.includes('where id = $1')) return { rows: [current] };
      if (sql.includes('from alert_rules')) return { rows: [{ id: 'holding', kind: 'holding_percentage_move', enabled: true, threshold: { value: '0.05', scopeId: 'security-1' }, baseline: 'prior_coherent_snapshot', cooldown_seconds: 300, daily_cap: 1 }] };
      if (sql.includes('as_of <')) return { rows: [prior] };
      if (sql.includes('transactions')) return { rows: [{ amount: '99' }] };
      return { rows: [{ amount: params?.[0] === 'run-prior' ? priorValue : '60' }] };
    });
    await createPostgresAlertEvaluator({ database: { query } as never, alerts: { appendEvent } })({ userId: 'owner', snapshotId: 'current', sourceAsOf: current.as_of, calculationVersion: 'v1' });
    expect(appendEvent).toHaveBeenCalledWith(expect.objectContaining({ state, evidence: expect.objectContaining({ observedRatio: observedRatio === null ? null : { value: observedRatio }, flowAdjustment: null, baselineObservationId: 'prior', scope: expect.objectContaining({ type: 'holding' }) }) }));
  });

  it('suppresses zero-total concentration without dividing by zero', async () => {
    const appendEvent = vi.fn();
    const snapshot = { id: 'zero', sync_run_id: 'run-zero', total_value: '0', as_of: '2026-08-26T12:00:00.000Z', coverage: 'complete', freshness: 'fresh', reconciliation_status: 'reconciled', payload: { quality: { mixedMarketState: false, unsupportedWeight: '1' } } };
    const query = vi.fn(async (sql: string) => {
      if (sql.includes('where id = $1')) return { rows: [snapshot] };
      if (sql.includes('from alert_rules')) return { rows: [{ id: 'concentration', kind: 'concentration_threshold', enabled: true, threshold: { value: '0.2', scopeId: 'security-1' }, baseline: null, cooldown_seconds: 300, daily_cap: 1 }] };
      return { rows: [{ amount: '100' }] };
    });

    await expect(createPostgresAlertEvaluator({ database: { query } as never, alerts: { appendEvent } })({ userId: 'owner', snapshotId: 'zero', sourceAsOf: snapshot.as_of, calculationVersion: 'v1' })).resolves.toBeUndefined();
    expect(appendEvent).toHaveBeenCalledWith(expect.objectContaining({
      state: 'suppressed',
      evidence: expect.objectContaining({ observedRatio: null, quality: expect.objectContaining({ unsupportedWeight: { value: '1' } }) }),
    }));
  });

  it('consumes the real promotion quality payload and its true regular-close marker', async () => {
    const appendEvent = vi.fn();
    const previous = promotedSnapshot({ id: 'previous-close', syncRunId: 'run-previous', total: '80', asOf: '2026-08-25T20:05:00.000Z' });
    const current = promotedSnapshot({ id: 'current-close', syncRunId: 'run-current', total: '100', asOf: '2026-08-26T20:05:00.000Z' });
    const query = vi.fn(async (sql: string) => {
      if (sql.includes('where id = $1')) return { rows: [current] };
      if (sql.includes('from alert_rules')) return { rows: [{ id: 'portfolio-move', kind: 'portfolio_percentage_move', enabled: true, threshold: { value: '0.1', scopeId: null }, baseline: 'prior_regular_session_close', cooldown_seconds: 300, daily_cap: 1 }] };
      if (sql.includes('regularSessionCloseEligible')) return { rows: [previous] };
      if (sql.includes('transactions')) return { rows: [{ amount: '0' }] };
      return { rows: [] };
    });

    await createPostgresAlertEvaluator({ database: { query } as never, alerts: { appendEvent } })({ userId: 'owner', snapshotId: current.id, sourceAsOf: current.as_of, calculationVersion: 'v1' });

    expect(query).toHaveBeenCalledWith(expect.stringContaining("regularSessionCloseEligible"), ['owner', current.as_of]);
    expect(appendEvent).toHaveBeenCalledWith(expect.objectContaining({
      ruleId: 'portfolio-move',
      state: 'breach_confirmed',
      evidence: expect.objectContaining({
        baselineObservationId: 'previous-close',
        observedRatio: { value: '0.25' },
        quality: expect.objectContaining({ mixedMarketState: false, unsupportedWeight: { value: '0' } }),
        scope: { type: 'portfolio', id: null },
      }),
    }));
  });
});
