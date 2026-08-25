import { describe, expect, it } from 'vitest';
import { evaluateBenchmarkEligibility } from '../../src/benchmark/eligibility';

const portfolio = [
  { date: '2026-08-21', value: '100', currency: 'USD', session: 'regular_close', coverage: 'complete' },
  { date: '2026-08-24', value: '102', currency: 'USD', session: 'regular_close', coverage: 'complete' },
] as const;

const benchmark = [
  { date: '2026-08-21', close: '50', adjusted: true },
  { date: '2026-08-24', close: '51', adjusted: true },
] as const;

describe('benchmark eligibility', () => {
  it('aligns adjusted-close USD regular-session dates', () => {
    expect(evaluateBenchmarkEligibility(portfolio, benchmark)).toEqual({
      eligible: true,
      reason: null,
      aligned: [
        { date: '2026-08-21', portfolioValue: '100', benchmarkClose: '50' },
        { date: '2026-08-24', portfolioValue: '102', benchmarkClose: '51' },
      ],
    });
  });

  it('rejects missing dates, incomplete coverage, and unadjusted bars', () => {
    expect(evaluateBenchmarkEligibility(portfolio, benchmark.slice(0, 1)).reason).toMatch(
      /date_missing/,
    );
    expect(
      evaluateBenchmarkEligibility(
        [{ ...portfolio[0], coverage: 'partial' }, portfolio[1]],
        benchmark,
      ).reason,
    ).toBe('incomplete_portfolio_coverage');
    expect(
      evaluateBenchmarkEligibility(portfolio, [{ ...benchmark[0], adjusted: false }, benchmark[1]])
        .reason,
    ).toBe('benchmark_not_adjusted');
  });
});
