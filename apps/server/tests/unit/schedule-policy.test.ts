import { describe, expect, it } from 'vitest';
import {
  calculateRetryPolicy,
  evaluateSchedule,
  intradayPruneBefore,
} from '../../src/sync/schedule-policy';

describe('refresh schedule policy', () => {
  it('uses 60-second interactive and 15-minute background regular-session gates', () => {
    expect(
      evaluateSchedule({
        now: '2026-08-25T14:15:01.000Z',
        session: {
          kind: 'regular',
          tradingDate: '2026-08-25',
          openAt: '2026-08-25T13:30:00.000Z',
          closeAt: '2026-08-25T20:00:00.000Z',
          halfDay: false,
        },
        lastInteractiveRefreshAt: '2026-08-25T14:14:00.000Z',
        lastBackgroundRefreshAt: '2026-08-25T14:00:00.000Z',
        lastRegularCloseTradingDate: null,
        lastOffHoursCheckpointDate: null,
      }),
    ).toMatchObject({
      interactiveEligible: true,
      backgroundEligible: true,
      backgroundIntervalSeconds: 900,
    });
  });

  it('uses hourly cadence and only one checkpoint outside market hours', () => {
    expect(
      evaluateSchedule({
        now: '2026-08-25T23:00:00.000Z',
        session: {
          kind: 'closed',
          tradingDate: '2026-08-25',
          openAt: null,
          closeAt: null,
          halfDay: false,
        },
        lastInteractiveRefreshAt: null,
        lastBackgroundRefreshAt: '2026-08-25T21:59:00.000Z',
        lastRegularCloseTradingDate: '2026-08-25',
        lastOffHoursCheckpointDate: null,
      }),
    ).toMatchObject({
      backgroundEligible: true,
      backgroundIntervalSeconds: 3600,
      offHoursCheckpointDue: true,
      regularCloseSnapshotDue: false,
    });
  });

  it('honors a half-day close and does not invent a close snapshot on holidays', () => {
    const halfDay = evaluateSchedule({
      now: '2026-11-27T18:05:00.000Z',
      session: {
        kind: 'regular',
        tradingDate: '2026-11-27',
        openAt: '2026-11-27T14:30:00.000Z',
        closeAt: '2026-11-27T18:00:00.000Z',
        halfDay: true,
      },
      lastInteractiveRefreshAt: null,
      lastBackgroundRefreshAt: null,
      lastRegularCloseTradingDate: null,
      lastOffHoursCheckpointDate: null,
    });
    expect(halfDay.regularCloseSnapshotDue).toBe(true);

    const holiday = evaluateSchedule({
      now: '2026-12-25T20:00:00.000Z',
      session: {
        kind: 'holiday',
        tradingDate: '2026-12-25',
        openAt: null,
        closeAt: null,
        halfDay: false,
      },
      lastInteractiveRefreshAt: null,
      lastBackgroundRefreshAt: null,
      lastRegularCloseTradingDate: '2026-12-24',
      lastOffHoursCheckpointDate: '2026-12-25',
    });
    expect(holiday).toMatchObject({
      regularCloseSnapshotDue: false,
      offHoursCheckpointDue: false,
      backgroundIntervalSeconds: 3600,
      backgroundEligible: false,
    });
  });

  it('slows interactive refresh off-hours and waits for close finalization', () => {
    const offHours = evaluateSchedule({
      now: '2026-08-29T14:01:01.000Z',
      session: {
        kind: 'closed',
        tradingDate: '2026-08-29',
        openAt: null,
        closeAt: null,
        halfDay: false,
      },
      lastInteractiveRefreshAt: '2026-08-29T14:00:00.000Z',
      lastBackgroundRefreshAt: '2026-08-29T14:00:00.000Z',
      lastRegularCloseTradingDate: '2026-08-28',
      lastOffHoursCheckpointDate: '2026-08-29',
    });
    expect(offHours.interactiveEligible).toBe(false);

    const exactClose = evaluateSchedule({
      now: '2026-08-25T20:00:00.000Z',
      session: {
        kind: 'regular',
        tradingDate: '2026-08-25',
        openAt: '2026-08-25T13:30:00.000Z',
        closeAt: '2026-08-25T20:00:00.000Z',
        halfDay: false,
      },
      lastInteractiveRefreshAt: null,
      lastBackgroundRefreshAt: null,
      lastRegularCloseTradingDate: null,
      lastOffHoursCheckpointDate: null,
    });
    expect(exactClose.regularCloseSnapshotDue).toBe(false);
  });

  it('defines 30-day intraday retention and bounded retry circuit behavior', () => {
    expect(intradayPruneBefore('2026-08-31T00:00:00.000Z')).toBe(
      '2026-08-01T00:00:00.000Z',
    );
    expect(calculateRetryPolicy(1)).toEqual({
      delaySeconds: 5,
      circuit: 'closed',
    });
    expect(calculateRetryPolicy(5)).toEqual({
      delaySeconds: 300,
      circuit: 'open',
    });
  });
});
