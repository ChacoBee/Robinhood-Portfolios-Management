import { randomUUID } from 'node:crypto';
import {
  SnapshotPersistenceError,
  type AuditRepository,
  type PortfolioRepository,
} from '../db/repositories';
import type { JobRecord, JobRepository } from '../db/jobs';
import type { RobinhoodReadClient } from '../robinhood/client';
import {
  valueEquityPositions,
  valueOptionPositions,
} from '../robinhood/mapper';
import { ProviderBoundaryError } from '../robinhood/errors';
import { PublicRefreshRequestSchema } from '../robinhood/schemas';
import {
  buildSnapshotPromotion,
  SnapshotPromotionError,
  type AccountRefreshBundle,
} from './snapshot-promotion';
import type { ValuationSessionPhase } from './freshness-policy';
import type { SafeRefreshFailureCode } from './failure-codes';

export type RefreshTrigger = 'manual' | 'page_load' | 'heartbeat' | 'scheduled';

export interface RefreshServiceDependencies {
  client: Pick<
    RobinhoodReadClient,
    | 'readAccounts'
    | 'readPortfolio'
    | 'readEquityPositions'
    | 'readEquityQuotes'
    | 'readOptionPositions'
    | 'readOptionQuotes'
    | 'readOptionInstruments'
  >;
  portfolios: PortfolioRepository;
  jobs: JobRepository;
  audit: AuditRepository;
  now?: () => Date;
  createId?: () => string;
  disconnectProvider?: (userId: string) => Promise<void>;
  afterSnapshotPromoted?: (input: {
    userId: string;
    snapshotId: string;
    sourceAsOf: string;
    calculationVersion: string;
  }) => Promise<void>;
  valuationSession: () => {
    phase: ValuationSessionPhase;
    lastRegularCloseAt: string | null;
  };
}

export type RefreshRunResult =
  | {
      state: 'promoted';
      snapshotId: string;
      totalValue: string;
      accountCount: number;
    }
  | { state: 'failed'; reason: SafeRefreshFailureCode }
  | { state: 'lease_lost' }
  | { state: 'idle' };

function safeFailureReason(error: unknown): SafeRefreshFailureCode {
  if (error instanceof SnapshotPromotionError) return error.reason;
  if (error instanceof ProviderBoundaryError) return error.code;
  if (error instanceof SnapshotPersistenceError) return error.code;
  return 'unknown_refresh_failure';
}

export class RefreshService {
  private readonly now: () => Date;
  private readonly createId: () => string;

  constructor(private readonly dependencies: RefreshServiceDependencies) {
    this.now = dependencies.now ?? (() => new Date());
    this.createId = dependencies.createId ?? randomUUID;
  }

  async request(userId: string, trigger: RefreshTrigger): Promise<JobRecord> {
    const parsed = PublicRefreshRequestSchema.parse({ trigger });
    return this.dependencies.jobs.enqueueUnique({
      userId,
      kind: 'portfolio_refresh',
      key: `refresh:${userId}`,
      payload: { trigger: parsed.trigger },
    });
  }

  async runNext(workerId: string): Promise<RefreshRunResult> {
    const job = await this.dependencies.jobs.claimNext(workerId, 90);
    if (!job) return { state: 'idle' };

    if (job.kind !== 'portfolio_refresh') {
      await this.dependencies.jobs.fail(job.id, workerId, 'unsupported_job_kind');
      return { state: 'failed', reason: 'unsupported_job_kind' };
    }

    let leaseLost = false;
    const heartbeat = setInterval(() => {
      void this.dependencies.jobs
        .renewLease(job.id, workerId, 90)
        .then((renewed) => {
          if (!renewed) leaseLost = true;
        })
        .catch(() => {
          leaseLost = true;
        });
    }, 30_000);
    heartbeat.unref();
    let syncRunId: string | null = null;
    const ensureLease = async () => {
      if (
        leaseLost ||
        !(await this.dependencies.jobs.renewLease(job.id, workerId, 90))
      ) {
        throw new SnapshotPersistenceError('job_lease_lost');
      }
    };

    try {
      await ensureLease();
      syncRunId = this.createId();
      const requestedTrigger = PublicRefreshRequestSchema.safeParse(job.payload);
      await this.dependencies.portfolios.startSyncRun({
        id: syncRunId,
        userId: job.userId,
        trigger: requestedTrigger.success
          ? requestedTrigger.data.trigger
          : 'scheduled',
      });
      const accounts = await this.dependencies.client.readAccounts();
      const expectedAccountKeys =
        await this.dependencies.portfolios.getExpectedAccountKeys(job.userId);
      const discoveredAccountKeys = new Set<string>(
        accounts.map((account) => account.stableKey as string),
      );
      if (expectedAccountKeys.some((key) => !discoveredAccountKeys.has(key))) {
        throw new SnapshotPromotionError('expected_account_missing');
      }
      const partialBundles = [];
      for (const account of accounts) {
        await ensureLease();
        const portfolio = await this.dependencies.client.readPortfolio(
          account.providerRef,
        );
        await ensureLease();
        const equityPositions =
          await this.dependencies.client.readEquityPositions(account.providerRef);
        await ensureLease();
        const optionPositions =
          await this.dependencies.client.readOptionPositions(account.providerRef);
        partialBundles.push({ account, portfolio, equityPositions, optionPositions });
      }
      const quoteRequests = [
        ...new Map(
          partialBundles
            .flatMap((bundle) => bundle.equityPositions)
            .map((position) => [
              position.instrumentId,
              {
                instrumentId: position.instrumentId,
                symbol: position.symbol,
              },
            ]),
        ).values(),
      ];
      await ensureLease();
      const quotes =
        quoteRequests.length === 0
          ? []
          : await this.dependencies.client.readEquityQuotes(quoteRequests);
      const optionIds = [
        ...new Set(
          partialBundles.flatMap((bundle) =>
            bundle.optionPositions.map((position) => position.optionId),
          ),
        ),
      ];
      const [optionQuotes, optionInstruments] =
        optionIds.length === 0
          ? [[], []] as const
          : await Promise.all([
              this.dependencies.client.readOptionQuotes(optionIds),
              this.dependencies.client.readOptionInstruments(optionIds),
            ]);
      const receivedAt = this.now().toISOString();
      const bundles: AccountRefreshBundle[] = partialBundles.map((bundle) => ({
        ...bundle,
        equityPositions: valueEquityPositions(
          bundle.equityPositions,
          quotes.filter((quote) =>
            bundle.equityPositions.some(
              (position) => position.instrumentId === quote.instrumentId,
            ),
          ),
        ),
        optionPositions: valueOptionPositions(
          bundle.optionPositions,
          optionQuotes.filter((quote) =>
            bundle.optionPositions.some((position) => position.optionId === quote.optionId),
          ),
          optionInstruments.filter((instrument) =>
            bundle.optionPositions.some((position) => position.optionId === instrument.optionId),
          ),
          receivedAt,
        ),
        quotes: quotes.filter((quote) =>
          bundle.equityPositions.some(
            (position) => position.instrumentId === quote.instrumentId,
          ),
        ),
      }));
      const snapshotId = this.createId();
      const promotion = buildSnapshotPromotion({
        syncRunId,
        bundles,
        receivedAt,
        trigger: requestedTrigger.success
          ? requestedTrigger.data.trigger
          : 'scheduled',
        ...this.dependencies.valuationSession(),
      });

      await ensureLease();
      const persisted = await this.dependencies.portfolios.promoteSnapshot({
        id: snapshotId,
        userId: job.userId,
        syncRunId,
        totalValue: promotion.totalValue.amount,
        asOf: promotion.asOf,
        coverage: promotion.coverage,
        freshness: promotion.freshness,
        reconciliationStatus: promotion.reconciliationStatus,
        calculationVersion: promotion.calculationVersion,
        payload: promotion.payload,
        receivedAt,
        sourceWindowStart: promotion.sourceWindowStart,
        sourceWindowEnd: promotion.sourceWindowEnd,
        sourceFingerprint: promotion.sourceFingerprint,
        syncCompleteness: promotion.syncCompleteness,
        mappingVersion: promotion.mappingVersion,
        accounts: promotion.accounts,
        leaseGuard: { jobId: job.id, workerId },
        auditEvent: {
          actor: 'sync_worker',
          action: 'portfolio_snapshot_promoted',
          scope: snapshotId,
          metadata: {
            accountCount: promotion.accountCount,
            coverage: promotion.coverage,
          },
        },
      });

      if (persisted.promoted && this.dependencies.afterSnapshotPromoted) {
        try {
          await this.dependencies.afterSnapshotPromoted({
            userId: job.userId,
            snapshotId: persisted.snapshotId,
            sourceAsOf: promotion.asOf,
            calculationVersion: promotion.calculationVersion,
          });
        } catch {
          await this.dependencies.audit.append({
            userId: job.userId,
            actor: 'sync_worker',
            action: 'alert_evaluation_failed',
            scope: persisted.snapshotId,
            metadata: { failureCode: 'alert_evaluation_failed' },
          });
        }
      }

      return {
        state: 'promoted',
        snapshotId: persisted.snapshotId,
        totalValue: promotion.totalValue.amount,
        accountCount: promotion.accountCount,
      };
    } catch (error) {
      if (
        error instanceof SnapshotPersistenceError &&
        error.code === 'job_lease_lost'
      ) {
        if (syncRunId) {
          await this.dependencies.portfolios.recordFailedRun(
            job.userId,
            'job_lease_lost',
            syncRunId,
          );
        }
        return { state: 'lease_lost' };
      }
      const stillOwned = await this.dependencies.jobs.renewLease(
        job.id,
        workerId,
        90,
      );
      if (!stillOwned) return { state: 'lease_lost' };
      const reason = safeFailureReason(error);
      if (syncRunId) {
        await this.dependencies.portfolios.recordFailedRun(
          job.userId,
          reason,
          syncRunId,
        );
      } else {
        await this.dependencies.portfolios.recordFailedRun(job.userId, reason);
      }
      await this.dependencies.jobs.fail(job.id, workerId, reason);
      await this.dependencies.audit.append({
        userId: job.userId,
        actor: 'sync_worker',
        action: 'portfolio_refresh_failed',
        scope: job.id,
        metadata: { reason },
      });
      return { state: 'failed', reason };
    } finally {
      clearInterval(heartbeat);
    }
  }

  async disconnect(userId: string): Promise<void> {
    if (!this.dependencies.disconnectProvider) {
      throw new Error('provider_disconnect_not_configured');
    }
    await this.dependencies.disconnectProvider(userId);
    await this.dependencies.audit.append({
      userId,
      actor: 'owner',
      action: 'robinhood_connection_disconnected',
      scope: userId,
    });
  }
}
