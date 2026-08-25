export interface PortfolioBenchmarkPoint {
  date: string;
  value: string;
  currency: string;
  session: 'regular_close' | 'intraday' | 'mixed';
  coverage: 'complete' | 'partial';
}

export interface AdjustedClosePoint {
  date: string;
  close: string;
  adjusted: boolean;
}

export interface BenchmarkEligibility {
  eligible: boolean;
  reason: string | null;
  aligned: Array<{
    date: string;
    portfolioValue: string;
    benchmarkClose: string;
  }>;
}

export function evaluateBenchmarkEligibility(
  portfolio: readonly PortfolioBenchmarkPoint[],
  benchmark: readonly AdjustedClosePoint[],
): BenchmarkEligibility {
  if (portfolio.length < 2) return { eligible: false, reason: 'insufficient_portfolio_history', aligned: [] };
  if (portfolio.some((point) => point.currency !== 'USD')) {
    return { eligible: false, reason: 'non_usd_portfolio', aligned: [] };
  }
  if (portfolio.some((point) => point.session !== 'regular_close')) {
    return { eligible: false, reason: 'portfolio_not_regular_close_aligned', aligned: [] };
  }
  if (portfolio.some((point) => point.coverage !== 'complete')) {
    return { eligible: false, reason: 'incomplete_portfolio_coverage', aligned: [] };
  }
  if (benchmark.some((point) => !point.adjusted)) {
    return { eligible: false, reason: 'benchmark_not_adjusted', aligned: [] };
  }
  const benchmarkByDate = new Map(benchmark.map((point) => [point.date, point]));
  const missing = portfolio.find((point) => !benchmarkByDate.has(point.date));
  if (missing) return { eligible: false, reason: `benchmark_date_missing:${missing.date}`, aligned: [] };
  return {
    eligible: true,
    reason: null,
    aligned: portfolio.map((point) => ({
      date: point.date,
      portfolioValue: point.value,
      benchmarkClose: benchmarkByDate.get(point.date)!.close,
    })),
  };
}
