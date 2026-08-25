export type SessionKind = 'regular' | 'closed' | 'holiday';

export interface MarketSessionWindow {
  kind: SessionKind;
  tradingDate: string;
  openAt: string | null;
  closeAt: string | null;
  halfDay: boolean;
}

export interface SchedulePolicyInput {
  now: string;
  session: MarketSessionWindow;
  lastInteractiveRefreshAt: string | null;
  lastBackgroundRefreshAt: string | null;
  lastRegularCloseTradingDate: string | null;
  lastOffHoursCheckpointDate: string | null;
}

export interface ScheduleDecision {
  interactiveEligible: boolean;
  backgroundEligible: boolean;
  backgroundIntervalSeconds: 900 | 3600;
  regularCloseSnapshotDue: boolean;
  offHoursCheckpointDue: boolean;
  halfDay: boolean;
}

const REGULAR_INTERACTIVE_SECONDS = 60;
const OFF_HOURS_INTERACTIVE_SECONDS = 900;
const CLOSE_GRACE_SECONDS = 300;

function parsedTimestamp(value: string | null): number | null {
  if (value === null) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function elapsedAtLeast(
  now: number,
  prior: string | null,
  intervalSeconds: number,
): boolean {
  const priorTimestamp = parsedTimestamp(prior);
  return priorTimestamp === null || now - priorTimestamp >= intervalSeconds * 1000;
}

export function evaluateSchedule(input: SchedulePolicyInput): ScheduleDecision {
  const now = parsedTimestamp(input.now);
  if (now === null) throw new Error('Invalid schedule timestamp');

  const openAt = parsedTimestamp(input.session.openAt);
  const closeAt = parsedTimestamp(input.session.closeAt);
  const inRegularWindow =
    input.session.kind === 'regular' &&
    openAt !== null &&
    closeAt !== null &&
    now >= openAt &&
    now < closeAt;
  const backgroundIntervalSeconds = inRegularWindow ? 900 : 3600;
  const regularCloseSnapshotDue =
    input.session.kind === 'regular' &&
    closeAt !== null &&
    now >= closeAt + CLOSE_GRACE_SECONDS * 1000 &&
    input.lastRegularCloseTradingDate !== input.session.tradingDate;
  const offHoursCheckpointDue =
    !inRegularWindow &&
    input.session.kind !== 'holiday' &&
    input.lastOffHoursCheckpointDate !== input.session.tradingDate;

  return {
    interactiveEligible: elapsedAtLeast(
      now,
      input.lastInteractiveRefreshAt,
      inRegularWindow
        ? REGULAR_INTERACTIVE_SECONDS
        : OFF_HOURS_INTERACTIVE_SECONDS,
    ),
    backgroundEligible:
      input.session.kind !== 'holiday' &&
      elapsedAtLeast(
        now,
        input.lastBackgroundRefreshAt,
        backgroundIntervalSeconds,
      ),
    backgroundIntervalSeconds,
    regularCloseSnapshotDue,
    offHoursCheckpointDue,
    halfDay: input.session.halfDay,
  };
}

export function intradayPruneBefore(now: string): string {
  const timestamp = parsedTimestamp(now);
  if (timestamp === null) throw new Error('Invalid retention timestamp');
  return new Date(timestamp - 30 * 24 * 60 * 60 * 1000).toISOString();
}

export function calculateRetryPolicy(attempt: number): {
  delaySeconds: number;
  circuit: 'closed' | 'open';
} {
  const normalizedAttempt = Math.max(1, Math.trunc(attempt));
  return {
    delaySeconds: Math.min(5 * 3 ** (normalizedAttempt - 1), 300),
    circuit: normalizedAttempt >= 5 ? 'open' : 'closed',
  };
}
