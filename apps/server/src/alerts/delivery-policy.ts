import type {
  AlertEvaluation,
  DeliveryDecision,
  DeliveryRecord,
  FactualAlertRule,
  NotificationChannel,
} from './contracts';

export function decideDelivery(
  evaluation: AlertEvaluation,
  history: readonly DeliveryRecord[],
  nowUtc: Date,
  options: {
    rule: FactualAlertRule;
    channel: NotificationChannel;
    channelAvailable: boolean;
    mutedUntil?: string | null;
  },
): DeliveryDecision {
  if (evaluation.state !== 'breach_confirmed') {
    return { deliver: false, reason: 'not_confirmed' };
  }
  if (!options.channelAvailable) return { deliver: false, reason: 'channel_unavailable' };
  if (options.mutedUntil && new Date(options.mutedUntil) > nowUtc) {
    return { deliver: false, reason: 'muted' };
  }
  const channelHistory = history.filter((record) => record.channel === options.channel);
  if (channelHistory.some((record) => record.fingerprint === evaluation.fingerprint)) {
    return { deliver: false, reason: 'duplicate' };
  }

  const latest = channelHistory
    .map((record) => new Date(record.deliveredAt).valueOf())
    .sort((left, right) => right - left)[0];
  if (
    latest !== undefined &&
    nowUtc.valueOf() - latest < options.rule.cooldownSeconds * 1_000
  ) {
    return { deliver: false, reason: 'cooldown' };
  }

  const dayStart = Date.UTC(
    nowUtc.getUTCFullYear(),
    nowUtc.getUTCMonth(),
    nowUtc.getUTCDate(),
  );
  const deliveredToday = channelHistory.filter(
    (record) => new Date(record.deliveredAt).valueOf() >= dayStart,
  ).length;
  if (deliveredToday >= options.rule.dailyCap) {
    return { deliver: false, reason: 'daily_cap' };
  }
  return { deliver: true, reason: 'confirmed' };
}
