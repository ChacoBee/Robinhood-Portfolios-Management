import { describe, expect, it } from 'vitest';
import { evaluateConnectedHealth } from '../../src/operations/health';

const now = new Date('2026-08-25T16:00:00.000Z');

describe('operational health dimensions', () => {
  it('reports ready only when database, verified provider, and worker are healthy', () => {
    expect(
      evaluateConnectedHealth({
        databaseReady: true,
        providerVerified: true,
        workerHeartbeatAt: '2026-08-25T15:59:30.000Z',
        lastSuccessfulRefreshAt: '2026-08-25T15:58:00.000Z',
        now,
      }),
    ).toMatchObject({
      status: 'ok',
      database: 'ready',
      worker: 'healthy',
      provider: 'configured',
    });
  });

  it('distinguishes a stalled worker and disconnected provider', () => {
    expect(
      evaluateConnectedHealth({
        databaseReady: true,
        providerVerified: true,
        workerHeartbeatAt: '2026-08-25T15:50:00.000Z',
        lastSuccessfulRefreshAt: '2026-08-25T15:49:00.000Z',
        now,
      }),
    ).toMatchObject({ status: 'degraded', worker: 'stalled' });

    expect(
      evaluateConnectedHealth({
        databaseReady: true,
        providerVerified: false,
        workerHeartbeatAt: '2026-08-25T15:59:30.000Z',
        lastSuccessfulRefreshAt: null,
        now,
      }),
    ).toMatchObject({ status: 'degraded', provider: 'unavailable' });
  });
});
