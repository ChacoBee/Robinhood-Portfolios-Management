import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { parseEnvironment } from './config';
import { createPostgresClient } from './db/client';
import { createRepositories } from './db/repositories';
import { RobinhoodReadClient } from './robinhood/client';
import { HttpMcpTransport } from './robinhood/transport';
import { AesGcmAccountReferenceVault } from './robinhood/vault';
import type { VerifiedRobinhoodAuthorizationProvider } from './robinhood/authorization';
import { RefreshService } from './sync/refresh-service';
import { resolveUsEquitySession } from './sync/market-calendar';
import { runRefreshWorkerLoop } from './sync/worker-loop';
import {
  RefreshScheduler,
  runRefreshSchedulerLoop,
} from './sync/scheduler';

export interface TrustedRobinhoodWorkerComposition {
  endpoint: string;
  approvedEndpointOrigins: readonly string[];
  expectedIssuer: string;
  expectedAudience: string;
  authorizationProvider: VerifiedRobinhoodAuthorizationProvider;
  fetchImplementation?: typeof fetch;
}

/**
 * The only executable portfolio worker path. It composes the closed read-only
 * adapter and delegates claim/lease/promotion semantics to RefreshService.
 */
export async function startWorker(
  environment: Readonly<Record<string, string | undefined>> = process.env,
  trustedComposition?: TrustedRobinhoodWorkerComposition,
) {
  const config = parseEnvironment(environment);
  if (config.APP_MODE !== 'connected') {
    throw new Error('connected_mode_required');
  }
  if (!trustedComposition) {
    throw new Error('verified_robinhood_authorization_required');
  }

  const vault = new AesGcmAccountReferenceVault(
    config.ACCOUNT_REFERENCE_ENCRYPTION_KEY,
  );
  const transport = new HttpMcpTransport({
    endpoint: trustedComposition.endpoint,
    approvedEndpointOrigins: trustedComposition.approvedEndpointOrigins,
    expectedIssuer: trustedComposition.expectedIssuer,
    expectedAudience: trustedComposition.expectedAudience,
    authorizationProvider: trustedComposition.authorizationProvider,
    ...(trustedComposition.fetchImplementation
      ? { fetchImplementation: trustedComposition.fetchImplementation }
      : {}),
  });
  const database = createPostgresClient(config.DATABASE_URL);
  const repositories = createRepositories(database, {
    providerIdentifierKeyer: vault,
  });
  const client = new RobinhoodReadClient(transport, vault);
  const service = new RefreshService({
    client,
    portfolios: repositories.portfolios,
    jobs: repositories.jobs,
    audit: repositories.audit,
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
    await database.close();
  }
}

const invokedFile = process.argv[1]
  ? pathToFileURL(process.argv[1]).href
  : null;

if (invokedFile === import.meta.url) {
  await startWorker();
}
