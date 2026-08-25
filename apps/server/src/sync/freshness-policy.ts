export type ValuationSessionPhase =
  | 'regular'
  | 'extended'
  | 'closed'
  | 'holiday';

export type FreshnessFailureReason =
  | 'invalid_source_timestamp'
  | 'source_timestamp_in_future'
  | 'source_skew_exceeded'
  | 'source_stale';

export type FreshnessEvaluation =
  | {
      eligible: true;
      asOf: string;
      sourceWindowStart: string;
      sourceWindowEnd: string;
      maxSkewSeconds: number;
      quoteFreshness: 'fresh' | 'stale' | 'unavailable';
    }
  | { eligible: false; reason: FreshnessFailureReason };

export interface FreshnessPolicyInput {
  receivedAt: string;
  phase: ValuationSessionPhase;
  requiredSourceTimes: readonly string[];
  valuationSourceTimes?: readonly string[];
  quoteSourceTimes: readonly string[];
  lastRegularCloseAt?: string | null;
  maxSourceSkewSeconds?: number;
}

function timestamp(value: string): number | null {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function maximumAgeSeconds(phase: ValuationSessionPhase): number {
  if (phase === 'regular') return 120;
  if (phase === 'extended') return 900;
  return 24 * 60 * 60;
}

function quoteFreshness(
  sourceTimes: readonly string[],
  receivedAt: number,
  phase: ValuationSessionPhase,
): 'fresh' | 'stale' | 'unavailable' {
  if (sourceTimes.length === 0) return 'unavailable';
  const parsed = sourceTimes.map(timestamp);
  if (parsed.some((value) => value === null)) return 'stale';
  const maximumAge = maximumAgeSeconds(phase) * 1000;
  return (parsed as number[]).every(
    (value) => value <= receivedAt + 5_000 && receivedAt - value <= maximumAge,
  )
    ? 'fresh'
    : 'stale';
}

export function evaluateSourceFreshness(
  input: FreshnessPolicyInput,
): FreshnessEvaluation {
  const receivedAt = timestamp(input.receivedAt);
  const parsed = input.requiredSourceTimes.map(timestamp);
  const valuationParsed = (
    input.valuationSourceTimes ?? input.requiredSourceTimes
  ).map(timestamp);
  if (
    receivedAt === null ||
    parsed.length === 0 ||
    parsed.some((value) => value === null) ||
    valuationParsed.length === 0 ||
    valuationParsed.some((value) => value === null)
  ) {
    return { eligible: false, reason: 'invalid_source_timestamp' };
  }
  const required = parsed as number[];
  const valuations = valuationParsed as number[];
  if (required.some((value) => value > receivedAt + 5_000)) {
    return { eligible: false, reason: 'source_timestamp_in_future' };
  }

  const earliest = Math.min(...required);
  const latest = Math.max(...required);
  const maxSkewSeconds = (latest - earliest) / 1000;
  if (maxSkewSeconds > (input.maxSourceSkewSeconds ?? 120)) {
    return { eligible: false, reason: 'source_skew_exceeded' };
  }

  if (
    input.phase === 'extended' ||
    input.phase === 'closed' ||
    input.phase === 'holiday'
  ) {
    const closeAt = input.lastRegularCloseAt
      ? timestamp(input.lastRegularCloseAt)
      : null;
    if (
      closeAt === null ||
      required.some((value) => value < closeAt)
    ) {
      return { eligible: false, reason: 'source_stale' };
    }
  }
  if (
    input.phase !== 'closed' &&
    input.phase !== 'holiday' &&
    required.some(
      (value) =>
        receivedAt - value > maximumAgeSeconds(input.phase) * 1000,
    )
  ) {
    return { eligible: false, reason: 'source_stale' };
  }

  return {
    eligible: true,
    asOf: new Date(Math.min(...valuations)).toISOString(),
    sourceWindowStart: new Date(earliest).toISOString(),
    sourceWindowEnd: new Date(latest).toISOString(),
    maxSkewSeconds,
    quoteFreshness: quoteFreshness(
      input.quoteSourceTimes,
      receivedAt,
      input.phase,
    ),
  };
}
