import { pathToFileURL } from 'node:url';
import { parseEnrollmentEnvironment } from './config';
import { createPostgresClient, type DatabaseClient } from './db/client';
import { createRepositories, type RepositorySet } from './db/repositories';
import { RobinhoodOAuthStore } from './robinhood/oauth-store';
import { bootstrapConfiguredOwner } from './runtime/owner-bootstrap';
import { verifyRobinhoodEnrollment } from './runtime/enrollment-verification';

const enrollmentFailure = 'verified_robinhood_authorization_required';

export interface VerifyEnrollmentOptions {
  environment: Readonly<Record<string, string | undefined>>;
  createDatabase?: (url: string) => DatabaseClient;
  createRepositories?: (database: DatabaseClient) => RepositorySet;
  bootstrapOwner?: typeof bootstrapConfiguredOwner;
  createStore?: (
    credentials: RepositorySet['oauthCredentials'],
    ownerId: string,
    encryptionKey: string,
  ) => Pick<RobinhoodOAuthStore, 'load'>;
}

/** One-shot Compose gate: no transport or worker loop is created here. */
export async function verifyEnrollment(options: VerifyEnrollmentOptions): Promise<void> {
  const createDatabase = options.createDatabase ?? createPostgresClient;
  const repositoriesFactory = options.createRepositories ?? createRepositories;
  const bootstrapOwner = options.bootstrapOwner ?? bootstrapConfiguredOwner;
  const createStore = options.createStore ?? ((credentials, ownerId, key) =>
    new RobinhoodOAuthStore(credentials, ownerId, key));
  let database: DatabaseClient | undefined;

  try {
    const config = parseEnrollmentEnvironment(options.environment);
    if (config.APP_MODE !== 'connected') throw new Error(enrollmentFailure);
    database = createDatabase(config.DATABASE_URL);
    const repositories = repositoriesFactory(database);
    const ownerId = await bootstrapOwner(repositories.portfolios, {
      clerkUserId: config.OWNER_CLERK_USER_ID,
      email: config.OWNER_EMAIL,
    });
    await verifyRobinhoodEnrollment(createStore(
      repositories.oauthCredentials,
      ownerId,
      config.ROBINHOOD_OAUTH_ENCRYPTION_KEY,
    ));
  } catch {
    throw new Error(enrollmentFailure);
  } finally {
    try {
      await database?.close();
    } catch {
      // Closing a one-shot verifier must not disclose infrastructure details.
    }
  }
}

const invokedFile = process.argv[1] ? pathToFileURL(process.argv[1]).href : null;

if (invokedFile === import.meta.url) {
  await verifyEnrollment({ environment: process.env });
}
