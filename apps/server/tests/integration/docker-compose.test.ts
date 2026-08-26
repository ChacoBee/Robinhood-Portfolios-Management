import { execFileSync } from 'node:child_process';
import { copyFile, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

const repositoryRoot = join(dirname(fileURLToPath(import.meta.url)), '../../../..');
const composeSource = join(repositoryRoot, 'docker-compose.yml');
const temporaryDirectories: string[] = [];
const sentinels = {
  APP_MODE: 'sentinel-app-mode',
  AURUM_DATA_MODE: 'sentinel-data-mode',
  NODE_ENV: 'sentinel-node-environment',
  POSTGRES_DB: 'sentinel-postgres-db',
  POSTGRES_USER: 'sentinel-postgres-user',
  POSTGRES_PASSWORD: 'sentinel-postgres-password',
  DATABASE_URL: 'postgresql://sentinel-database-url',
  OWNER_CLERK_USER_ID: 'sentinel-owner-user-id',
  OWNER_EMAIL: 'sentinel-owner-email',
  WEB_ORIGIN: 'https://sentinel-web-origin.example.test',
  CLERK_PUBLISHABLE_KEY: 'sentinel-clerk-publishable-key',
  CLERK_ISSUER_URL: 'https://sentinel-clerk-issuer.example.test',
  CLERK_SECRET_KEY: 'sentinel-clerk-secret-key',
  CSRF_SECRET: 'sentinel-csrf-secret',
  ACCOUNT_REFERENCE_ENCRYPTION_KEY: 'sentinel-account-reference-key',
  ROBINHOOD_OAUTH_ENCRYPTION_KEY: 'sentinel-robinhood-oauth-key',
} as const;

async function renderedCompose() {
  const directory = await mkdtemp(join(tmpdir(), 'aurum-compose-'));
  temporaryDirectories.push(directory);
  await copyFile(composeSource, join(directory, 'docker-compose.yml'));
  await writeFile(join(directory, '.env'), Object.entries(sentinels).map(([name, value]) => `${name}=${value}`).join('\n'));
  return JSON.parse(execFileSync('docker', ['compose', '-f', join(directory, 'docker-compose.yml'), '--env-file', join(directory, '.env'), '--profile', 'ops', 'config', '--format', 'json'], {
    encoding: 'utf8',
    env: { ...process.env, NODE_ENV: sentinels.NODE_ENV },
  })) as {
    services: Record<string, { environment?: Record<string, string>; ports?: Array<{ host_ip?: string; published?: string; target?: number }>; profiles?: string[]; depends_on?: Record<string, { condition?: string }> }>;
  };
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { force: true, recursive: true })));
});

describe('connected Compose runtime', () => {
  it('isolates each service secret set and gates startup on healthy dependencies', async () => {
    const { services } = await renderedCompose();
    expect(Object.keys(services).sort()).toEqual(['api', 'connect-robinhood', 'migrate', 'postgres', 'web', 'worker']);
    expect(services.postgres?.ports).toBeUndefined();
    expect(services.postgres?.environment).toEqual({
      POSTGRES_DB: sentinels.POSTGRES_DB,
      POSTGRES_USER: sentinels.POSTGRES_USER,
      POSTGRES_PASSWORD: sentinels.POSTGRES_PASSWORD,
    });
    expect(services.migrate?.environment).toEqual({
      NODE_ENV: sentinels.NODE_ENV,
      DATABASE_URL: sentinels.DATABASE_URL,
    });
    expect(services.api?.environment).toEqual({
      APP_MODE: sentinels.APP_MODE,
      NODE_ENV: sentinels.NODE_ENV,
      DATABASE_URL: sentinels.DATABASE_URL,
      OWNER_CLERK_USER_ID: sentinels.OWNER_CLERK_USER_ID,
      OWNER_EMAIL: sentinels.OWNER_EMAIL,
      WEB_ORIGIN: sentinels.WEB_ORIGIN,
      CLERK_PUBLISHABLE_KEY: sentinels.CLERK_PUBLISHABLE_KEY,
      CLERK_ISSUER_URL: sentinels.CLERK_ISSUER_URL,
      CLERK_SECRET_KEY: sentinels.CLERK_SECRET_KEY,
      CSRF_SECRET: sentinels.CSRF_SECRET,
      AURUM_TRUSTED_COMPOSITION_MODULE: '/app/apps/server/src/runtime/trusted-composition.ts',
      API_HOST: '0.0.0.0',
    });
    expect(services.worker?.environment).toEqual({
      APP_MODE: sentinels.APP_MODE,
      NODE_ENV: sentinels.NODE_ENV,
      DATABASE_URL: sentinels.DATABASE_URL,
      OWNER_CLERK_USER_ID: sentinels.OWNER_CLERK_USER_ID,
      OWNER_EMAIL: sentinels.OWNER_EMAIL,
      ACCOUNT_REFERENCE_ENCRYPTION_KEY: sentinels.ACCOUNT_REFERENCE_ENCRYPTION_KEY,
      ROBINHOOD_OAUTH_ENCRYPTION_KEY: sentinels.ROBINHOOD_OAUTH_ENCRYPTION_KEY,
      AURUM_TRUSTED_COMPOSITION_MODULE: '/app/apps/server/src/runtime/trusted-composition.ts',
    });
    expect(services.web?.environment).toEqual({
      NODE_ENV: sentinels.NODE_ENV,
      AURUM_DATA_MODE: sentinels.AURUM_DATA_MODE,
      WEB_ORIGIN: sentinels.WEB_ORIGIN,
      CLERK_PUBLISHABLE_KEY: sentinels.CLERK_PUBLISHABLE_KEY,
      AURUM_API_URL: 'http://api:8787',
    });
    expect(services['connect-robinhood']?.environment).toEqual({
      APP_MODE: 'connected',
      NODE_ENV: sentinels.NODE_ENV,
      DATABASE_URL: sentinels.DATABASE_URL,
      OWNER_CLERK_USER_ID: sentinels.OWNER_CLERK_USER_ID,
      OWNER_EMAIL: sentinels.OWNER_EMAIL,
      ROBINHOOD_OAUTH_ENCRYPTION_KEY: sentinels.ROBINHOOD_OAUTH_ENCRYPTION_KEY,
      ROBINHOOD_CALLBACK_BIND_HOST: '0.0.0.0',
    });
    expect(services.migrate?.depends_on?.postgres?.condition).toBe('service_healthy');
    expect(services.api?.depends_on?.migrate?.condition).toBe('service_completed_successfully');
    expect(services.web?.depends_on?.api?.condition).toBe('service_healthy');
    expect(services.api?.ports).toEqual([expect.objectContaining({ host_ip: '127.0.0.1', published: '8787', target: 8787 })]);
    expect(services.web?.ports).toEqual([expect.objectContaining({ host_ip: '127.0.0.1', published: '3000', target: 3000 })]);
    expect(services['connect-robinhood']?.profiles).toEqual(['ops']);
    expect(services['connect-robinhood']?.ports).toEqual([expect.objectContaining({ host_ip: '127.0.0.1', published: '43117', target: 43117 })]);
  });
});
