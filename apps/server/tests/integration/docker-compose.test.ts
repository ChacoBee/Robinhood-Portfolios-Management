import { execFileSync } from 'node:child_process';
import { copyFile, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

const repositoryRoot = join(dirname(fileURLToPath(import.meta.url)), '../../../..');
const composeSource = join(repositoryRoot, 'docker-compose.yml');
const temporaryDirectories: string[] = [];

async function renderedCompose() {
  const directory = await mkdtemp(join(tmpdir(), 'aurum-compose-'));
  temporaryDirectories.push(directory);
  await copyFile(composeSource, join(directory, 'docker-compose.yml'));
  await writeFile(join(directory, '.env'), [
    'APP_MODE=connected',
    'AURUM_DATA_MODE=connected',
    'NODE_ENV=development',
    'POSTGRES_DB=aurum',
    'POSTGRES_USER=aurum',
    'POSTGRES_PASSWORD=synthetic-local-password',
    'DATABASE_URL=postgresql://aurum:synthetic-local-password@postgres:5432/aurum',
    'OWNER_CLERK_USER_ID=user_syntheticowner',
    'OWNER_EMAIL=owner@example.test',
    'WEB_ORIGIN=http://127.0.0.1:3000',
    'CLERK_PUBLISHABLE_KEY=pk_test_synthetic_public_identity_12345',
    'CLERK_ISSUER_URL=https://synthetic.clerk.accounts.dev',
    'CLERK_SECRET_KEY=synthetic-clerk-secret-not-real',
    'CSRF_SECRET=synthetic-csrf-secret-with-at-least-32-characters',
    'ACCOUNT_REFERENCE_ENCRYPTION_KEY=ERERERERERERERERERERERERERERERERERERERERERE=',
    'ROBINHOOD_OAUTH_ENCRYPTION_KEY=IiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiI=',
  ].join('\n'));
  return JSON.parse(execFileSync('docker', ['compose', '-f', join(directory, 'docker-compose.yml'), '--env-file', join(directory, '.env'), '--profile', 'ops', 'config', '--format', 'json'], {
    encoding: 'utf8',
    env: { ...process.env, NODE_ENV: 'development' },
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
    expect(services.migrate?.environment).toEqual(expect.objectContaining({ NODE_ENV: 'development', DATABASE_URL: expect.any(String) }));
    expect(Object.keys(services.migrate?.environment ?? {}).sort()).toEqual(['DATABASE_URL', 'NODE_ENV']);
    expect(services.migrate?.depends_on?.postgres?.condition).toBe('service_healthy');
    expect(services.api?.depends_on?.migrate?.condition).toBe('service_completed_successfully');
    expect(services.web?.depends_on?.api?.condition).toBe('service_healthy');
    expect(services.api?.ports).toEqual([expect.objectContaining({ host_ip: '127.0.0.1', published: '8787', target: 8787 })]);
    expect(services.web?.ports).toEqual([expect.objectContaining({ host_ip: '127.0.0.1', published: '3000', target: 3000 })]);
    expect(services['connect-robinhood']?.profiles).toEqual(['ops']);
    expect(services['connect-robinhood']?.ports).toEqual([expect.objectContaining({ host_ip: '127.0.0.1', published: '43117', target: 43117 })]);
    expect(services.api?.environment).not.toHaveProperty('ROBINHOOD_OAUTH_ENCRYPTION_KEY');
    expect(services.worker?.environment).not.toHaveProperty('CLERK_SECRET_KEY');
    expect(services.web?.environment).not.toHaveProperty('DATABASE_URL');
    expect(services['connect-robinhood']?.environment).not.toHaveProperty('CSRF_SECRET');
  });
});
