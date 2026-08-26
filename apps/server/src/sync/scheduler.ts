import { setTimeout as delay } from 'node:timers/promises';
import type { PortfolioRepository } from '../db/repositories';
import type { RefreshService } from './refresh-service';
import { resolveUsEquitySession } from './market-calendar';
import { evaluateSchedule } from './schedule-policy';

export interface RefreshSchedulerDependencies {
  portfolios: Pick<PortfolioRepository, 'listOwnerRefreshStates'>;
  refresh: Pick<RefreshService, 'request'>;
  now?: () => Date;
}

export class RefreshScheduler {
  private readonly now: () => Date;

  constructor(private readonly dependencies: RefreshSchedulerDependencies) {
    this.now = dependencies.now ?? (() => new Date());
  }

  async tick(): Promise<number> {
    const now = this.now();
    const context = resolveUsEquitySession(now);
    const owners = await this.dependencies.portfolios.listOwnerRefreshStates();
    let enqueued = 0;

    for (const owner of owners) {
      const closeAt = context.scheduleWindow.closeAt;
      const currentReachedClose =
        closeAt !== null &&
        owner.lastRegularCloseCheckpointAsOf !== null &&
        Date.parse(owner.lastRegularCloseCheckpointAsOf) >= Date.parse(closeAt);
      const lastRefreshContext = owner.lastSuccessfulRefreshAt
        ? resolveUsEquitySession(new Date(owner.lastSuccessfulRefreshAt))
        : null;
      const lastOffHoursCheckpointDate =
        lastRefreshContext && lastRefreshContext.phase !== 'regular'
          ? lastRefreshContext.scheduleWindow.tradingDate
          : null;
      const decision = evaluateSchedule({
        now: now.toISOString(),
        session: context.scheduleWindow,
        lastInteractiveRefreshAt: owner.lastSuccessfulRefreshAt,
        lastBackgroundRefreshAt: owner.lastSuccessfulRefreshAt,
        lastRegularCloseTradingDate: currentReachedClose
          ? context.scheduleWindow.tradingDate
          : null,
        lastOffHoursCheckpointDate,
      });

      if (
        decision.backgroundEligible ||
        decision.regularCloseSnapshotDue ||
        decision.offHoursCheckpointDue
      ) {
        await this.dependencies.refresh.request(owner.userId, 'scheduled');
        enqueued += 1;
      }
    }

    return enqueued;
  }
}

export async function runRefreshSchedulerLoop(
  scheduler: RefreshScheduler,
  options: { intervalMs?: number; signal?: AbortSignal } = {},
): Promise<void> {
  const intervalMs = options.intervalMs ?? 30_000;
  while (!options.signal?.aborted) {
    await scheduler.tick();
    await delay(intervalMs, undefined, { signal: options.signal });
  }
}
