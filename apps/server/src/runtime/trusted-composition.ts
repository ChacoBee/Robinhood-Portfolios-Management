import type { DatabaseClient } from '../db/client';
import { createPostgresClient } from '../db/client';
import type { RepositorySet } from '../db/repositories';
import type { OAuthCredentialRepository, PortfolioRepository } from '../db/repositories';
import { createRepositories } from '../db/repositories';
import { parseApiEnvironment, parseWorkerEnvironment } from '../config';
import { RobinhoodOAuthProvider, robinhoodMcpEndpoint } from '../robinhood/oauth-provider';
import { RobinhoodOAuthStore } from '../robinhood/oauth-store';
import { bootstrapConfiguredOwner } from './owner-bootstrap';
import { createClerkOwnerVerifier, type ClerkOwnerVerifierOptions } from './clerk-owner-verifier';

type RuntimeDatabase = Pick<DatabaseClient, 'close'>;
type RuntimeRepositories = { portfolios: Pick<PortfolioRepository, 'createOwner'>; oauthCredentials: Partial<OAuthCredentialRepository> & Pick<OAuthCredentialRepository, 'load'> };
type Environment = Readonly<Record<string, string | undefined>>;

export interface ApiCompositionOptions {
  environment?: Environment;
  database?: RuntimeDatabase;
  repositories?: RuntimeRepositories;
  ownerId?: string;
  createClerkVerifier?: (options: ClerkOwnerVerifierOptions) => ReturnType<typeof createClerkOwnerVerifier>;
}
export interface WorkerCompositionOptions {
  environment?: Environment;
  database?: RuntimeDatabase;
  repositories?: RuntimeRepositories;
  ownerId?: string;
  createStore?: (credentials: RuntimeRepositories['oauthCredentials'], ownerId: string, key: string) => Pick<RobinhoodOAuthStore, 'markHeartbeat'> & Partial<RobinhoodOAuthStore>;
}

async function configuredOwnerId(repositories: RuntimeRepositories, ownerId: string | undefined, input: { clerkUserId: string; email: string }) {
  return ownerId ?? bootstrapConfiguredOwner(repositories.portfolios, input);
}

/** API composition deliberately reads only ciphertext presence and durable timestamps. */
export async function createApiComposition(options: ApiCompositionOptions = {}) {
  const config = parseApiEnvironment(options.environment ?? process.env);
  if (config.APP_MODE !== 'connected') throw new Error('connected_mode_required');
  const database = options.database ?? createPostgresClient(config.DATABASE_URL);
  const repositories = options.repositories ?? createRepositories(database as DatabaseClient);
  try {
    const ownerId = await configuredOwnerId(repositories, options.ownerId, { clerkUserId: config.OWNER_CLERK_USER_ID, email: config.OWNER_EMAIL });
    const ownerVerifier = (options.createClerkVerifier ?? createClerkOwnerVerifier)({ secretKey: config.CLERK_SECRET_KEY, publishableKey: config.CLERK_PUBLISHABLE_KEY, webOrigin: config.WEB_ORIGIN, issuer: config.CLERK_ISSUER_URL, ownerClerkUserId: config.OWNER_CLERK_USER_ID, ownerEmail: config.OWNER_EMAIL });
    return {
      database,
      ownerId,
      ownerVerifier,
      async connectedHealthProbe() {
        const grant = await repositories.oauthCredentials.load(ownerId, 'robinhood');
        return {
          providerVerified: grant?.connectionState === 'connected' && grant.tokenSet !== null,
          workerHeartbeatAt: grant?.lastHeartbeatAt === null || grant?.lastHeartbeatAt === undefined ? null : new Date(grant.lastHeartbeatAt).toISOString(),
        };
      },
      close: () => database.close(),
    };
  } catch (error) {
    await database.close();
    throw error;
  }
}

/** Worker composition is the sole holder of Robinhood OAuth material and transport authority. */
export async function createWorkerComposition(options: WorkerCompositionOptions = {}) {
  const config = parseWorkerEnvironment(options.environment ?? process.env);
  if (config.APP_MODE !== 'connected') throw new Error('connected_mode_required');
  const database = options.database ?? createPostgresClient(config.DATABASE_URL);
  const repositories = options.repositories ?? createRepositories(database as DatabaseClient);
  try {
    const ownerId = await configuredOwnerId(repositories, options.ownerId, { clerkUserId: config.OWNER_CLERK_USER_ID, email: config.OWNER_EMAIL });
    const store = options.createStore?.(repositories.oauthCredentials, ownerId, config.ROBINHOOD_OAUTH_ENCRYPTION_KEY) ?? new RobinhoodOAuthStore(repositories.oauthCredentials as OAuthCredentialRepository, ownerId, config.ROBINHOOD_OAUTH_ENCRYPTION_KEY);
    return {
      database,
      ownerId,
      endpoint: robinhoodMcpEndpoint,
      approvedEndpointOrigins: ['https://agent.robinhood.com'] as const,
      authProvider: new RobinhoodOAuthProvider({ store: store as RobinhoodOAuthStore }),
      async afterSnapshotPromoted(_input: { userId: string; snapshotId: string; sourceAsOf: string; calculationVersion: string }) { await store.markHeartbeat(); },
      close: () => database.close(),
    };
  } catch (error) {
    await database.close();
    throw error;
  }
}
