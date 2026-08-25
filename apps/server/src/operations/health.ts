import type { HealthReadModel } from '@aurum/domain';

export function evaluateConnectedHealth(input: {
  databaseReady: boolean;
  providerVerified: boolean;
  workerHeartbeatAt: string | null;
  lastSuccessfulRefreshAt: string | null;
  now: Date;
  workerStalledAfterSeconds?: number;
}): HealthReadModel {
  const stalledAfter = (input.workerStalledAfterSeconds ?? 180) * 1_000;
  const heartbeat = input.workerHeartbeatAt
    ? new Date(input.workerHeartbeatAt).valueOf()
    : null;
  const worker =
    heartbeat === null
      ? 'unavailable'
      : input.now.valueOf() - heartbeat > stalledAfter
        ? 'stalled'
        : 'healthy';
  const database = input.databaseReady ? 'ready' : 'unavailable';
  const provider = input.providerVerified ? 'configured' : 'unavailable';
  return {
    status:
      database === 'ready' && provider === 'configured' && worker === 'healthy'
        ? 'ok'
        : 'degraded',
    mode: 'connected',
    database,
    worker,
    provider,
    lastSuccessfulRefreshAt: input.lastSuccessfulRefreshAt,
  };
}
