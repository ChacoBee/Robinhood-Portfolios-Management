import { describe, expect, it } from 'vitest';
import { evaluateSourceFreshness } from '../../src/sync/freshness-policy';

describe('valuation source freshness', () => {
  it('accepts the regular-session 120-second boundary and rejects 121 seconds', () => {
    const base = {
      receivedAt: '2026-08-25T14:02:00.000Z',
      phase: 'regular' as const,
      quoteSourceTimes: [] as string[],
    };
    expect(
      evaluateSourceFreshness({
        ...base,
        requiredSourceTimes: ['2026-08-25T14:00:00.000Z'],
      }),
    ).toMatchObject({ eligible: true, asOf: '2026-08-25T14:00:00.000Z' });
    expect(
      evaluateSourceFreshness({
        ...base,
        requiredSourceTimes: ['2026-08-25T13:59:59.000Z'],
      }),
    ).toEqual({ eligible: false, reason: 'source_stale' });
  });

  it('uses the oldest required valuation and ignores a newer quote for as-of', () => {
    expect(
      evaluateSourceFreshness({
        receivedAt: '2026-08-25T14:01:50.000Z',
        phase: 'regular',
        requiredSourceTimes: [
          '2026-08-25T13:59:50.000Z',
          '2026-08-25T14:00:00.000Z',
          '2026-08-25T14:00:30.000Z',
        ],
        valuationSourceTimes: [
          '2026-08-25T14:00:00.000Z',
          '2026-08-25T14:00:30.000Z',
        ],
        quoteSourceTimes: ['2026-08-25T14:01:50.000Z'],
      }),
    ).toMatchObject({
      eligible: true,
      asOf: '2026-08-25T14:00:00.000Z',
      sourceWindowStart: '2026-08-25T13:59:50.000Z',
      sourceWindowEnd: '2026-08-25T14:00:30.000Z',
      quoteFreshness: 'fresh',
    });
  });

  it('rejects coherent old sources and timestamps more than five seconds ahead', () => {
    expect(
      evaluateSourceFreshness({
        receivedAt: '2026-08-25T14:00:00.000Z',
        phase: 'regular',
        requiredSourceTimes: [
          '2026-08-24T14:00:00.000Z',
          '2026-08-24T14:00:30.000Z',
        ],
        quoteSourceTimes: [],
      }),
    ).toEqual({ eligible: false, reason: 'source_stale' });
    expect(
      evaluateSourceFreshness({
        receivedAt: '2026-08-25T14:00:00.000Z',
        phase: 'regular',
        requiredSourceTimes: ['2026-08-25T14:00:10.000Z'],
        quoteSourceTimes: [],
      }),
    ).toEqual({
      eligible: false,
      reason: 'source_timestamp_in_future',
    });
  });

  it('allows stale quotes without invalidating current provider valuations', () => {
    expect(
      evaluateSourceFreshness({
        receivedAt: '2026-08-25T14:02:00.000Z',
        phase: 'regular',
        requiredSourceTimes: ['2026-08-25T14:01:00.000Z'],
        quoteSourceTimes: ['2026-08-25T13:00:00.000Z'],
      }),
    ).toMatchObject({ eligible: true, quoteFreshness: 'stale' });
  });

  it('rejects a pre-close valuation during the post-close extended session', () => {
    expect(
      evaluateSourceFreshness({
        receivedAt: '2026-08-25T20:05:00.000Z',
        phase: 'extended',
        lastRegularCloseAt: '2026-08-25T20:00:00.000Z',
        requiredSourceTimes: ['2026-08-25T19:59:59.000Z'],
        quoteSourceTimes: [],
      }),
    ).toEqual({ eligible: false, reason: 'source_stale' });
  });
});
