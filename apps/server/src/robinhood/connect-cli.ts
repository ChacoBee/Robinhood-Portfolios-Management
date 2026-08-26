import { createServer, type Server } from 'node:http';
import { pathToFileURL } from 'node:url';
import {
  Client,
  StreamableHTTPClientTransport,
  type OAuthClientProvider,
  type Transport,
} from '@modelcontextprotocol/client';
import { parseEnvironment } from '../config';
import { createPostgresClient, type DatabaseClient } from '../db/client';
import { createRepositories, type RepositorySet } from '../db/repositories';
import { bootstrapConfiguredOwner } from '../runtime/owner-bootstrap';
import { allowedRobinhoodTools } from './read-methods';
import { RobinhoodOAuthProvider, RobinhoodOAuthProviderError, robinhoodMcpEndpoint } from './oauth-provider';
import { RobinhoodOAuthStore } from './oauth-store';

const callbackPath = '/callback';
const callbackPort = 43117;
const callbackIssuer = robinhoodMcpEndpoint;
const defaultCallbackTimeoutMs = 5 * 60_000;

export interface OAuthCallbackServer {
  waitForCallback(): Promise<URLSearchParams>;
  close(): Promise<void>;
  address(): { port: number } | null;
}

export interface StartOAuthCallbackServerOptions {
  host: string;
  port: number;
  validate: (params: URLSearchParams) => boolean;
  timeoutMs?: number;
}

function safeCallbackFailure(): Error {
  return new RobinhoodOAuthProviderError();
}

function callbackHasExactlyOne(params: URLSearchParams, name: string): boolean {
  return params.getAll(name).length === 1 && (params.get(name)?.length ?? 0) > 0;
}

function closeServer(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

/** Starts the callback listener before authorization and never reflects query data. */
export async function startOAuthCallbackServer(
  options: StartOAuthCallbackServerOptions,
): Promise<OAuthCallbackServer> {
  let resolveCallback: ((value: URLSearchParams) => void) | undefined;
  let rejectCallback: ((reason?: unknown) => void) | undefined;
  let settled = false;
  let timeout: NodeJS.Timeout | undefined;
  const callback = new Promise<URLSearchParams>((resolve, reject) => {
    resolveCallback = resolve;
    rejectCallback = reject;
  });
  const server = createServer((request, response) => {
    const url = new URL(request.url ?? '/', 'http://127.0.0.1');
    if (url.pathname !== callbackPath) {
      response.writeHead(404).end();
      return;
    }
    if (request.method !== 'GET') {
      response.writeHead(405, { Allow: 'GET' }).end();
      return;
    }
    const params = url.searchParams;
    if (
      settled ||
      !callbackHasExactlyOne(params, 'code') ||
      !callbackHasExactlyOne(params, 'state') ||
      !callbackHasExactlyOne(params, 'iss') ||
      params.has('error') ||
      !options.validate(params)
    ) {
      response.writeHead(400).end('Authorization failed');
      return;
    }
    settled = true;
    if (timeout) clearTimeout(timeout);
    resolveCallback?.(new URLSearchParams(params));
    response.writeHead(200).end('Authorization received. You may close this window.');
  });
  await new Promise<void>((resolve, reject) => {
    const onError = (error: Error) => {
      server.off('listening', onListening);
      reject(error);
    };
    const onListening = () => {
      server.off('error', onError);
      resolve();
    };
    server.once('error', onError);
    server.once('listening', onListening);
    server.listen(options.port, options.host);
  });
  if (options.timeoutMs !== undefined) {
    timeout = setTimeout(() => {
      if (!settled) {
        settled = true;
        rejectCallback?.(safeCallbackFailure());
      }
    }, options.timeoutMs);
  }
  return {
    waitForCallback: () => callback,
    address: () => {
      const address = server.address();
      return typeof address === 'object' && address !== null ? { port: address.port } : null;
    },
    close: async () => {
      if (timeout) clearTimeout(timeout);
      if (!settled) {
        settled = true;
        rejectCallback?.(safeCallbackFailure());
      }
      await closeServer(server);
    },
  };
}

export interface EnrollmentTransport extends Transport {
  finishAuth(params: URLSearchParams): Promise<void>;
}

export interface EnrollmentClient {
  connect(transport: EnrollmentTransport): Promise<void>;
  listTools(): Promise<{ tools: readonly { name: string }[] }>;
  close(): Promise<void>;
}

export interface EnrollmentClientTransport {
  client: EnrollmentClient;
  transport: EnrollmentTransport;
}

function createSdkClientTransport(input: {
  provider: OAuthClientProvider;
  fetch?: typeof globalThis.fetch;
}): EnrollmentClientTransport {
  const client = new Client({ name: 'aurum-portfolio', version: '0.1.0' });
  const transport = new StreamableHTTPClientTransport(new URL(robinhoodMcpEndpoint), {
    authProvider: input.provider,
    ...(input.fetch ? { fetch: input.fetch } : {}),
  });
  return { client, transport };
}

function exactReadTools(tools: readonly { name: string }[]): boolean {
  return (
    tools.length === allowedRobinhoodTools.length &&
    new Set(tools.map((tool) => tool.name)).size === allowedRobinhoodTools.length &&
    allowedRobinhoodTools.every((name) => tools.some((tool) => tool.name === name))
  );
}

async function safelyClose(value: { close(): Promise<void> } | undefined): Promise<void> {
  if (!value) return;
  try {
    await value.close();
  } catch {
    // Cleanup cannot replace the original, already-redacted enrollment failure.
  }
}

export interface ConnectRobinhoodOptions {
  environment: Readonly<Record<string, string | undefined>>;
  createDatabase?: (url: string) => DatabaseClient;
  createRepositories?: (database: DatabaseClient) => RepositorySet;
  bootstrapOwner?: typeof bootstrapConfiguredOwner;
  createStore?: (
    credentials: RepositorySet['oauthCredentials'],
    ownerId: string,
    encryptionKey: string,
  ) => RobinhoodOAuthStore;
  createProvider?: (input: {
    store: RobinhoodOAuthStore;
    fetch?: typeof globalThis.fetch;
  }) => RobinhoodOAuthProvider;
  createCallbackServer?: (
    input: StartOAuthCallbackServerOptions,
  ) => Promise<OAuthCallbackServer>;
  createClientTransport?: (input: {
    provider: OAuthClientProvider;
    fetch?: typeof globalThis.fetch;
  }) => EnrollmentClientTransport;
  openUrl?: (url: string) => Promise<void>;
  showAuthorizationUrl?: (url: string) => void;
  logger?: Pick<Console, 'info' | 'error'>;
  fetch?: typeof globalThis.fetch;
  callbackHost?: string;
  callbackPort?: number;
  callbackTimeoutMs?: number;
}

export function validateOAuthCallback(
  provider: Pick<RobinhoodOAuthProvider, 'consumeState'>,
  params: URLSearchParams,
): boolean {
  const state = params.get('state');
  return params.get('iss') === callbackIssuer && state !== null && provider.consumeState(state);
}

/** One-shot operator command. A token is marked connected only after tool verification. */
export async function connectRobinhood(options: ConnectRobinhoodOptions): Promise<void> {
  const createDatabase = options.createDatabase ?? createPostgresClient;
  const repositoriesFactory = options.createRepositories ?? createRepositories;
  const bootstrapOwner = options.bootstrapOwner ?? bootstrapConfiguredOwner;
  const createStore = options.createStore ?? ((credentials, ownerId, key) => new RobinhoodOAuthStore(credentials, ownerId, key));
  const createProvider = options.createProvider ?? ((input) => new RobinhoodOAuthProvider(input));
  const createCallbackServer = options.createCallbackServer ?? startOAuthCallbackServer;
  const createClientTransport = options.createClientTransport ?? createSdkClientTransport;
  const openUrl = options.openUrl ?? (async () => undefined);
  const showAuthorizationUrl = options.showAuthorizationUrl ?? ((url) => process.stdout.write(`${url}\n`));
  const logger = options.logger ?? console;
  let database: DatabaseClient | undefined;
  let callback: OAuthCallbackServer | undefined;
  let first: EnrollmentClientTransport | undefined;
  let second: EnrollmentClientTransport | undefined;

  try {
    const config = parseEnvironment(options.environment);
    if (config.APP_MODE !== 'connected') throw safeCallbackFailure();
    database = createDatabase(config.DATABASE_URL);
    const repositories = repositoriesFactory(database);
    const ownerId = await bootstrapOwner(repositories.portfolios, {
      clerkUserId: config.OWNER_CLERK_USER_ID,
      email: config.OWNER_EMAIL,
    });
    const store = createStore(
      repositories.oauthCredentials,
      ownerId,
      config.ROBINHOOD_OAUTH_ENCRYPTION_KEY,
    );
    const provider = createProvider({
      store,
      ...(options.fetch ? { fetch: options.fetch } : {}),
    });
    const guardedFetch = provider.fetch;
    callback = await createCallbackServer({
      host: options.callbackHost ?? '127.0.0.1',
      port: options.callbackPort ?? callbackPort,
      validate: (params) => validateOAuthCallback(provider, params),
      timeoutMs: options.callbackTimeoutMs ?? defaultCallbackTimeoutMs,
    });
    first = createClientTransport({
      provider,
      fetch: guardedFetch,
    });
    try {
      await first.client.connect(first.transport);
    } catch {
      const authorizationUrl = provider.authorizationUrl();
      if (!authorizationUrl) throw safeCallbackFailure();
      showAuthorizationUrl(authorizationUrl);
      await openUrl(authorizationUrl);
      await first.transport.finishAuth(await callback.waitForCallback());
    }

    second = createClientTransport({
      provider,
      fetch: guardedFetch,
    });
    await second.client.connect(second.transport);
    if (!exactReadTools((await second.client.listTools()).tools)) throw safeCallbackFailure();
    await store.markConnected();
    logger.info('Robinhood enrollment verified');
  } catch (error) {
    logger.error('Robinhood enrollment failed');
    if (error instanceof RobinhoodOAuthProviderError) throw error;
    throw safeCallbackFailure();
  } finally {
    await safelyClose(callback);
    await safelyClose(second?.client);
    await safelyClose(second?.transport);
    await safelyClose(first?.client);
    await safelyClose(first?.transport);
    await safelyClose(database);
  }
}

const invokedFile = process.argv[1] ? pathToFileURL(process.argv[1]).href : null;

if (invokedFile === import.meta.url) {
  await connectRobinhood({ environment: process.env });
}
