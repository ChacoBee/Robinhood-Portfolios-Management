import { describe, expect, it } from 'vitest';
import { calculateDailyChange, usd } from '../src/index';

const baseInput = {
  currentValue: usd('1125'),
  currentAsOf: '2026-08-25T20:00:00.000Z',
  priorCloseValue: usd('1000'),
  priorCloseAsOf: '2026-08-24T20:00:00.000Z',
  snapshotsEligible: true,
  flowCoverageComplete: true,
} as const;

describe('daily portfolio value change', () => {
  it('subtracts deposits and withdrawals but not dividends or internal transfers', () => {
    expect(
      calculateDailyChange({
        ...baseInput,
        activities: [
          {
            kind: 'deposit',
            amount: usd('100'),
            effectiveAt: '2026-08-25T13:00:00.000Z',
            timestampPrecision: 'instant',
          },
          {
            kind: 'withdrawal',
            amount: usd('-20'),
            effectiveAt: '2026-08-25T14:00:00.000Z',
            timestampPrecision: 'instant',
          },
          {
            kind: 'dividend',
            amount: usd('10'),
            effectiveAt: '2026-08-25T15:00:00.000Z',
            timestampPrecision: 'instant',
          },
          {
            kind: 'internal_transfer',
            amount: usd('300'),
            effectiveAt: '2026-08-25T16:00:00.000Z',
            timestampPrecision: 'instant',
          },
        ],
      }),
    ).toEqual({
      state: 'available',
      amount: usd('45'),
      ratio: null,
      externalFlowAdjustment: usd('80'),
      method: 'flow_adjusted_snapshots',
      label: 'flow_adjusted_value_change',
      quality: 'complete',
    });
  });

  it('returns a simple value-change ratio only when no external flow exists', () => {
    expect(
      calculateDailyChange({
        ...baseInput,
        activities: [
          {
            kind: 'dividend',
            amount: usd('10'),
            effectiveAt: '2026-08-25T15:00:00.000Z',
            timestampPrecision: 'instant',
          },
        ],
      }),
    ).toMatchObject({
      state: 'available',
      amount: usd('125'),
      ratio: { value: '0.125' },
      externalFlowAdjustment: usd('0'),
      label: 'portfolio_value_change',
    });
  });

  it('never treats a missing prior close as zero', () => {
    expect(
      calculateDailyChange({
        ...baseInput,
        priorCloseValue: null,
        priorCloseAsOf: null,
        activities: [],
      }),
    ).toEqual({
      state: 'unavailable',
      amount: null,
      ratio: null,
      externalFlowAdjustment: null,
      reason: 'missing_prior_close',
      quality: 'unavailable',
    });
  });

  it('fails closed for incomplete or date-only external-flow classification', () => {
    expect(
      calculateDailyChange({
        ...baseInput,
        flowCoverageComplete: false,
        activities: [],
      }),
    ).toMatchObject({ state: 'unavailable', reason: 'flow_coverage_incomplete' });

    expect(
      calculateDailyChange({
        ...baseInput,
        activities: [
          {
            kind: 'deposit',
            amount: usd('100'),
            effectiveAt: '2026-08-25',
            timestampPrecision: 'date',
          },
        ],
      }),
    ).toMatchObject({ state: 'unavailable', reason: 'flow_timestamp_imprecise' });
  });
});
