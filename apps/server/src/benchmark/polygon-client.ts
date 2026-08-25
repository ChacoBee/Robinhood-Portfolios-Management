import { z } from 'zod';

const AggregateResponse = z.object({
  adjusted: z.literal(true),
  status: z.literal('OK'),
  results: z
    .array(
      z.object({
        c: z.number().finite().positive(),
        t: z.number().int().nonnegative(),
      }),
    )
    .optional(),
});

export interface BenchmarkClient {
  readAdjustedDailyCloses(
    ticker: string,
    from: string,
    to: string,
  ): Promise<Array<{ date: string; close: string; adjusted: true }>>;
}

export class PolygonBenchmarkClient implements BenchmarkClient {
  constructor(
    private readonly apiKey: string,
    private readonly fetcher: typeof fetch = fetch,
    private readonly origin = 'https://api.massive.com',
  ) {
    if (!apiKey) throw new TypeError('Benchmark API key is required');
    if (new URL(origin).protocol !== 'https:') throw new TypeError('Benchmark HTTPS origin is required');
  }

  async readAdjustedDailyCloses(ticker: string, from: string, to: string) {
    if (!/^[A-Z][A-Z0-9.-]{0,14}$/.test(ticker)) throw new TypeError('Invalid benchmark ticker');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
      throw new TypeError('Benchmark dates must use YYYY-MM-DD');
    }
    const url = new URL(
      `/v2/aggs/ticker/${encodeURIComponent(ticker)}/range/1/day/${from}/${to}`,
      this.origin,
    );
    url.searchParams.set('adjusted', 'true');
    url.searchParams.set('sort', 'asc');
    url.searchParams.set('limit', '5000');
    url.searchParams.set('apiKey', this.apiKey);
    const response = await this.fetcher(url, { signal: AbortSignal.timeout(10_000) });
    if (!response.ok) throw new Error(`benchmark_source_${response.status}`);
    const parsed = AggregateResponse.parse(await response.json());
    return (parsed.results ?? []).map((point) => ({
      date: new Date(point.t).toISOString().slice(0, 10),
      close: String(point.c),
      adjusted: true as const,
    }));
  }
}
