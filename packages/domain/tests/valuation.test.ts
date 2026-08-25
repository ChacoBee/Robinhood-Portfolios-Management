import { describe, expect, it } from 'vitest';
import { selectPositionValuation, usd } from '../src/index';

const snapshotAsOf = '2026-08-25T14:02:00.000Z';

describe('position valuation precedence', () => {
  it('prefers a valid provider market value over quantity times quote', () => {
    expect(
      selectPositionValuation({
        providerValue: {
          value: usd('1000'),
          asOf: snapshotAsOf,
          marketState: 'regular',
          quality: 'complete',
        },
        quantity: '10',
        quote: {
          price: usd('101'),
          asOf: snapshotAsOf,
          marketState: 'regular',
          quality: 'complete',
        },
        snapshotAsOf,
        snapshotMarketState: 'regular',
        maxQuoteAgeSeconds: 120,
      }),
    ).toMatchObject({
      state: 'available',
      value: usd('1000'),
      source: 'provider_market_value',
      calculationEligible: true,
    });
  });

  it('uses a fresh compatible quote only when provider value is absent', () => {
    expect(
      selectPositionValuation({
        providerValue: null,
        quantity: '10',
        quote: {
          price: usd('101'),
          asOf: '2026-08-25T14:01:00.000Z',
          marketState: 'regular',
          quality: 'complete',
        },
        snapshotAsOf,
        snapshotMarketState: 'regular',
        maxQuoteAgeSeconds: 120,
      }),
    ).toEqual({
      state: 'available',
      value: usd('1010'),
      source: 'quote_times_quantity',
      sourceAsOf: '2026-08-25T14:01:00.000Z',
      marketState: 'regular',
      calculationEligible: true,
      quality: 'complete',
    });
  });

  it('rejects a stale quote fallback instead of returning zero', () => {
    expect(
      selectPositionValuation({
        providerValue: null,
        quantity: '10',
        quote: {
          price: usd('101'),
          asOf: '2026-08-25T13:59:59.000Z',
          marketState: 'regular',
          quality: 'complete',
        },
        snapshotAsOf,
        snapshotMarketState: 'regular',
        maxQuoteAgeSeconds: 120,
      }),
    ).toEqual({
      state: 'unavailable',
      value: null,
      source: 'unavailable',
      sourceAsOf: null,
      marketState: 'regular',
      calculationEligible: false,
      quality: 'unavailable',
      reason: 'stale_quote',
    });
  });

  it('retains a stale provider value for display but never replaces it with a quote', () => {
    expect(
      selectPositionValuation({
        providerValue: {
          value: usd('1000'),
          asOf: '2026-08-25T13:58:00.000Z',
          marketState: 'regular',
          quality: 'stale',
        },
        quantity: '10',
        quote: {
          price: usd('101'),
          asOf: snapshotAsOf,
          marketState: 'regular',
          quality: 'complete',
        },
        snapshotAsOf,
        snapshotMarketState: 'regular',
        maxQuoteAgeSeconds: 120,
      }),
    ).toMatchObject({
      state: 'stale',
      value: usd('1000'),
      source: 'provider_market_value',
      calculationEligible: false,
      quality: 'stale',
    });
  });
});
