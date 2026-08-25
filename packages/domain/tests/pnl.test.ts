import { describe, expect, it } from 'vitest';
import { calculateUnrealizedPnl, usd } from '../src/index';

const valuation = {
  state: 'available',
  value: usd('125.50'),
  source: 'provider_market_value',
  sourceAsOf: '2026-08-25T14:02:00.000Z',
  marketState: 'regular',
  calculationEligible: true,
  quality: 'complete',
} as const;

describe('unrealized P&L', () => {
  it('calculates amount and ratio from supported basis', () => {
    expect(
      calculateUnrealizedPnl({
        valuation,
        costBasis: usd('100'),
        costBasisSource: 'provider_average',
        basisKnown: true,
      }),
    ).toEqual({
      state: 'available',
      amount: usd('25.5'),
      ratio: { value: '0.255' },
      basisSource: 'provider_average',
      quality: 'complete',
      taxGrade: false,
    });
  });

  it('returns unavailable when cost basis is missing or partial', () => {
    expect(
      calculateUnrealizedPnl({
        valuation,
        costBasis: null,
        costBasisSource: 'unavailable',
        basisKnown: false,
      }),
    ).toEqual({
      state: 'unavailable',
      amount: null,
      ratio: null,
      basisSource: 'unavailable',
      quality: 'unavailable',
      taxGrade: false,
      reason: 'missing_cost_basis',
    });

    expect(
      calculateUnrealizedPnl({
        valuation,
        costBasis: usd('100'),
        costBasisSource: 'calculated_partial',
        basisKnown: true,
      }),
    ).toMatchObject({ state: 'unavailable', reason: 'partial_cost_basis' });
  });

  it('allows explicit known zero basis but suppresses the percentage', () => {
    expect(
      calculateUnrealizedPnl({
        valuation,
        costBasis: usd('0'),
        costBasisSource: 'provider_average',
        basisKnown: true,
      }),
    ).toMatchObject({
      state: 'available',
      amount: usd('125.5'),
      ratio: null,
    });
  });
});
