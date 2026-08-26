import { describe, expect, it } from 'vitest';
import { usd } from '@aurum/domain';
import { evaluateSourceFreshness } from '../../src/sync/freshness-policy';
import {
  buildSnapshotPromotion,
  isRegularCloseCheckpoint,
  type AccountRefreshBundle,
} from '../../src/sync/snapshot-promotion';

function promotionBundle(input: {
  stableKey: string;
  status: 'active' | 'closed';
  total: string;
  marketState?: 'regular' | 'extended' | 'closed' | 'unknown';
  sourceAsOf?: string;
}): AccountRefreshBundle {
  const at = input.sourceAsOf ?? '2026-08-25T20:05:00.000Z';
  return {
    account: {
      providerRef: `sealed-${input.stableKey}` as never,
      stableKey: input.stableKey as never,
      maskedAccountNumber: null,
      displayName: input.stableKey,
      status: input.status,
      totalKind: 'net_liquidation_value',
      sourceAsOf: at,
    },
    portfolio: {
      providerRef: `sealed-${input.stableKey}` as never,
      stableKey: input.stableKey as never,
      total: { state: 'available', value: usd(input.total) },
      cash: { state: 'available', value: usd(input.total) },
      buyingPower: { state: 'available', value: usd(input.total) },
      accrued: { state: 'available', value: usd('0') },
      currency: 'USD',
      sourceAsOf: at,
    },
    equityPositions: [],
    optionPositions: [],
    quotes: input.marketState
      ? [{
          instrumentId: `instrument-${input.stableKey}`,
          symbol: input.stableKey,
          price: usd('1'),
          currency: 'USD',
          marketState: input.marketState,
          sourceAsOf: at,
          quality: 'complete',
        }]
      : [],
  };
}

describe('valuation source freshness', () => {
  it('recognizes only the scheduled 4:05pm ET close checkpoint window', () => {
    expect(isRegularCloseCheckpoint('2026-08-25T20:05:00.000Z', '2026-08-25T20:00:00.000Z')).toBe(true);
    expect(isRegularCloseCheckpoint('2026-08-25T20:04:59.999Z', '2026-08-25T20:00:00.000Z')).toBe(false);
    expect(isRegularCloseCheckpoint('2026-08-25T21:05:00.000Z', '2026-08-25T20:00:00.000Z')).toBe(false);
    expect(isRegularCloseCheckpoint('2026-08-26T00:05:00.000Z', '2026-08-25T20:00:00.000Z')).toBe(false);
  });

  it('marks only a scheduled close refresh by receipt time, not quote time or the next hourly refresh', () => {
    const common = {
      syncRunId: 'run-close',
      phase: 'extended' as const,
      lastRegularCloseAt: '2026-08-25T20:00:00.000Z',
    };
    const close = buildSnapshotPromotion({
      ...common,
      receivedAt: '2026-08-25T20:05:00.000Z',
      trigger: 'scheduled',
      bundles: [promotionBundle({ stableKey: 'close', status: 'active', total: '100', sourceAsOf: '2026-08-25T20:04:00.000Z' })],
    });
    const hourly = buildSnapshotPromotion({
      ...common,
      syncRunId: 'run-hourly',
      receivedAt: '2026-08-25T21:05:00.000Z',
      trigger: 'scheduled',
      bundles: [promotionBundle({ stableKey: 'hourly', status: 'active', total: '100', sourceAsOf: '2026-08-25T21:04:00.000Z' })],
    });
    const manual = buildSnapshotPromotion({
      ...common,
      syncRunId: 'run-manual',
      receivedAt: '2026-08-25T20:05:00.000Z',
      trigger: 'manual',
      bundles: [promotionBundle({ stableKey: 'manual', status: 'active', total: '100', sourceAsOf: '2026-08-25T20:04:00.000Z' })],
    });

    expect(close.payload).toMatchObject({ quality: { regularSessionCloseEligible: true } });
    expect(hourly.payload).toMatchObject({ quality: { regularSessionCloseEligible: false } });
    expect(manual.payload).toMatchObject({ quality: { regularSessionCloseEligible: false } });
  });

  it('derives promotion quality only from included accounts and conservatively represents zero totals', () => {
    const input = {
      syncRunId: 'run-1',
      receivedAt: '2026-08-25T20:05:00.000Z',
      trigger: 'scheduled' as const,
      phase: 'extended' as const,
      lastRegularCloseAt: '2026-08-25T20:00:00.000Z',
    };
    const includedOnly = buildSnapshotPromotion({
      ...input,
      bundles: [
        promotionBundle({ stableKey: 'active', status: 'active', total: '100', marketState: 'regular' }),
        promotionBundle({ stableKey: 'excluded', status: 'closed', total: '0', marketState: 'extended' }),
      ],
    });
    const zeroTotal = buildSnapshotPromotion({
      ...input,
      bundles: [promotionBundle({ stableKey: 'zero', status: 'active', total: '0' })],
    });

    expect(includedOnly.payload).toMatchObject({
      quality: {
        mixedMarketState: false,
        unsupportedWeight: '0',
        regularSessionCloseEligible: true,
      },
    });
    expect(zeroTotal.payload).toMatchObject({
      quality: {
        mixedMarketState: false,
        unsupportedWeight: '1',
        regularSessionCloseEligible: true,
      },
    });
  });
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
