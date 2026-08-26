import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { parseWorkerEnvironment } from './config';
import type { DatabaseClient } from './db/client';
import { createPostgresClient } from './db/client';
import { createRepositories } from './db/repositories';
import { RobinhoodReadClient } from './robinhood/client';
import {
  SdkMcpTransport,
  type RobinhoodAuthProvider,
} from './robinhood/transport';
import { AesGcmAccountReferenceVault } from './robinhood/vault';
import { RefreshService } from './sync/refresh-service';
import { resolveUsEquitySession } from './sync/market-calendar';
import { runRefreshWorkerLoop } from './sync/worker-loop';
import { loadTrustedComposition } from './runtime/composition-loader';
import { bootstrapConfiguredOwner } from './runtime/owner-bootstrap';
import {
  RefreshScheduler,
  runRefreshSchedulerLoop,
} from './sync/scheduler';

export interface TrustedRobinhoodWorkerComposition {
  database?: DatabaseClient;
  ownerId?: string;
  close?: () => Promise<void>;
  endpoint: string;
  approvedEndpointOrigins: readonly string[];
  authProvider: RobinhoodAuthProvider;
  afterSnapshotPromoted: (input: {
    userId: string;
    snapshotId: string;
    sourceAsOf: string;
    calculationVersion: string;
  }) => Promise<void>;
}

/**
 * The only executable portfolio worker path. It composes the closed read-only
 * adapter and delegates claim/lease/promotion semantics to RefreshService.
 */
export async function startWorker(
  environment: Readonly<Record<string, string | undefined>> = process.env,
  trustedComposition?: TrustedRobinhoodWorkerComposition,
) {
  const config = parseWorkerEnvironment(environment);
  if (config.APP_MODE !== 'connected') {
    throw new Error('connected_mode_required');
  }
  const resolvedComposition =
    trustedComposition ??
    (await loadTrustedComposition<TrustedRobinhoodWorkerComposition>(
      environment.AURUM_TRUSTED_COMPOSITION_MODULE,
      'createWorkerComposition',
    ));
  if (!resolvedComposition) {
    throw new Error('verified_robinhood_authorization_required');
  }
  if (!resolvedComposition.afterSnapshotPromoted) {
    await resolvedComposition.close?.();
    throw new Error('alert_evaluation_composition_required');
  }

  const vault = new AesGcmAccountReferenceVault(
    config.ACCOUNT_REFERENCE_ENCRYPTION_KEY,
  );
  const transport = new SdkMcpTransport({
    endpoint: resolvedComposition.endpoint,
    approvedEndpointOrigins: resolvedComposition.approvedEndpointOrigins,
    authProvider: resolvedComposition.authProvider,
  });
  const database = resolvedComposition.database ?? createPostgresClient(config.DATABASE_URL);
  const repositories = createRepositories(database, {
    providerIdentifierKeyer: vault,
  });
  try {
    if (!resolvedComposition.ownerId) await bootstrapConfiguredOwner(repositories.portfolios, {
      clerkUserId: config.OWNER_CLERK_USER_ID,
      email: config.OWNER_EMAIL,
    });
  } catch (error) {
    await (resolvedComposition.close ?? database.close.bind(database))();
    throw error;
  }
  const client = new RobinhoodReadClient(transport, vault);
  const service = new RefreshService({
    client,
    portfolios: repositories.portfolios,
    jobs: repositories.jobs,
    audit: repositories.audit,
    afterSnapshotPromoted: resolvedComposition.afterSnapshotPromoted,
    valuationSession: () => {
      const context = resolveUsEquitySession(new Date());
      return {
        phase: context.phase,
        lastRegularCloseAt: context.lastRegularCloseAt,
      };
    },
  });
  const controller = new AbortController();
  const scheduler = new RefreshScheduler({
    portfolios: repositories.portfolios,
    refresh: service,
  });
  const stop = () => controller.abort();
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);

  try {
    await Promise.all([
      runRefreshWorkerLoop(service, {
        workerId: `worker-${randomUUID()}`,
        signal: controller.signal,
      }),
      runRefreshSchedulerLoop(scheduler, { signal: controller.signal }),
    ]);
  } catch (error) {
    if (!controller.signal.aborted) throw error;
  } finally {
    process.off('SIGINT', stop);
    process.off('SIGTERM', stop);
    try {
      await transport.close();
    } finally {
      await (resolvedComposition.close ?? database.close.bind(database))();
    }
  }
}

const invokedFile = process.argv[1]
  ? pathToFileURL(process.argv[1]).href
  : null;

if (invokedFile === import.meta.url) {
  await startWorker();
}
