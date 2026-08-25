import { describe, expect, it, vi } from 'vitest';
import { RefreshScheduler } from '../../src/sync/scheduler';

function schedulerAt(now: string, state: {
  lastSuccessfulRefreshAt: string | null;
  currentSnapshotAsOf: string | null;
}) {
  const request = vi.fn(async () => ({ id: 'job' }));
  const scheduler = new RefreshScheduler({
    now: () => new Date(now),
    portfolios: {
      listOwnerRefreshStates: async () => [
        { userId: 'owner-1', ...state },
      ],
    },
    refresh: { request: request as never },
  });
  return { scheduler, request };
}

describe('connected refresh scheduler', () => {
  it('enqueues a regular-session background refresh and suppresses holidays', async () => {
    const regular = schedulerAt('2026-08-25T14:00:00.000Z', {
      lastSuccessfulRefreshAt: null,
      currentSnapshotAsOf: null,
    });
    expect(await regular.scheduler.tick()).toBe(1);
    expect(regular.request).toHaveBeenCalledWith('owner-1', 'scheduled');

    const holiday = schedulerAt('2026-06-19T15:00:00.000Z', {
      lastSuccessfulRefreshAt: null,
      currentSnapshotAsOf: null,
    });
    expect(await holiday.scheduler.tick()).toBe(0);
  });

  it('retries the close checkpoint after grace until a close-valued snapshot exists', async () => {
    const due = schedulerAt('2026-08-25T20:05:00.000Z', {
      lastSuccessfulRefreshAt: '2026-08-25T20:04:59.000Z',
      currentSnapshotAsOf: '2026-08-25T19:59:59.000Z',
    });
    expect(await due.scheduler.tick()).toBe(1);

    const complete = schedulerAt('2026-08-25T20:05:00.000Z', {
      lastSuccessfulRefreshAt: '2026-08-25T20:04:59.000Z',
      currentSnapshotAsOf: '2026-08-25T20:00:00.000Z',
    });
    expect(await complete.scheduler.tick()).toBe(0);
  });

  it('enqueues exactly one persisted off-hours checkpoint per trading date', async () => {
    const due = schedulerAt('2026-08-25T23:00:00.000Z', {
      lastSuccessfulRefreshAt: '2026-08-25T19:59:00.000Z',
      currentSnapshotAsOf: '2026-08-25T20:00:00.000Z',
    });
    expect(await due.scheduler.tick()).toBe(1);

    const complete = schedulerAt('2026-08-25T23:00:00.000Z', {
      lastSuccessfulRefreshAt: '2026-08-25T22:30:00.000Z',
      currentSnapshotAsOf: '2026-08-25T22:29:30.000Z',
    });
    expect(await complete.scheduler.tick()).toBe(0);
  });
});
