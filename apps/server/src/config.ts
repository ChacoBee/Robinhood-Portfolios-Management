import { z } from 'zod';

const NodeEnvironmentSchema = z.enum(['development', 'test', 'production']);
const NormalizedEmailSchema = z.string().transform((value) => value.trim().toLowerCase()).pipe(z.string().email());
const EncryptionKeySchema = z.string().refine((value) => /^[A-Za-z0-9+/]+={0,2}$/.test(value) && Buffer.from(value, 'base64').length === 32, 'Must be a base64-encoded 32-byte key');
const DatabaseUrlSchema = z.string().url().superRefine((value, context) => {
  const protocol = new URL(value).protocol;
  if (protocol !== 'postgresql:' && protocol !== 'postgres:') context.addIssue({ code: 'custom', message: 'DATABASE_URL must use the PostgreSQL scheme' });
});

function enforceProductionTls(value: { NODE_ENV: string; DATABASE_URL: string }, context: z.RefinementCtx) {
  if (value.NODE_ENV === 'production' && new URL(value.DATABASE_URL).searchParams.get('sslmode') !== 'verify-full') context.addIssue({ code: 'custom', path: ['DATABASE_URL'], message: 'Production DATABASE_URL must set sslmode=verify-full' });
}
function exactHttpsOrigin(name: string) {
  return z.string().url().superRefine((value, context) => {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username !== '' || url.password !== '' || url.origin !== value) context.addIssue({ code: 'custom', message: `${name} must be an exact HTTPS origin` });
  });
}
const WebOriginSchema = z.string().url().superRefine((value, context) => {
  const url = new URL(value);
  const isExactOrigin = url.username === '' && url.password === '' && url.origin === value;
  const isLoopback = url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '[::1]';
  if (!isExactOrigin || (url.protocol !== 'https:' && url.protocol !== 'http:')) context.addIssue({ code: 'custom', message: 'WEB_ORIGIN must be an exact HTTPS origin' });
  else if (url.protocol === 'http:' && !isLoopback) context.addIssue({ code: 'custom', message: 'WEB_ORIGIN HTTP is only permitted for an exact loopback origin' });
});

const DemoEnvironmentSchema = z.object({ APP_MODE: z.literal('demo'), NODE_ENV: NodeEnvironmentSchema });
const ConnectedBaseSchema = z.object({ APP_MODE: z.literal('connected'), NODE_ENV: NodeEnvironmentSchema, DATABASE_URL: DatabaseUrlSchema, OWNER_CLERK_USER_ID: z.string().regex(/^user_[A-Za-z0-9_-]{3,}$/), OWNER_EMAIL: NormalizedEmailSchema });
const ApiConnectedSchema = ConnectedBaseSchema.extend({ WEB_ORIGIN: WebOriginSchema, CLERK_PUBLISHABLE_KEY: z.string().regex(/^pk_(?:test|live)_[A-Za-z0-9_-]{10,}$/), CLERK_ISSUER_URL: exactHttpsOrigin('CLERK_ISSUER_URL'), CLERK_SECRET_KEY: z.string().min(20), CSRF_SECRET: z.string().min(32) }).superRefine((value, context) => {
  enforceProductionTls(value, context);
  if (value.NODE_ENV === 'production' && new URL(value.WEB_ORIGIN).protocol !== 'https:') context.addIssue({ code: 'custom', path: ['WEB_ORIGIN'], message: 'WEB_ORIGIN must be an exact HTTPS origin' });
});
const WorkerConnectedSchema = ConnectedBaseSchema.extend({ ACCOUNT_REFERENCE_ENCRYPTION_KEY: EncryptionKeySchema, ROBINHOOD_OAUTH_ENCRYPTION_KEY: EncryptionKeySchema }).superRefine((value, context) => {
  enforceProductionTls(value, context);
  if (Buffer.from(value.ACCOUNT_REFERENCE_ENCRYPTION_KEY, 'base64').equals(Buffer.from(value.ROBINHOOD_OAUTH_ENCRYPTION_KEY, 'base64'))) context.addIssue({ code: 'custom', path: ['ROBINHOOD_OAUTH_ENCRYPTION_KEY'], message: 'ROBINHOOD_OAUTH_ENCRYPTION_KEY must differ from ACCOUNT_REFERENCE_ENCRYPTION_KEY' });
});
const EnrollmentConnectedSchema = ConnectedBaseSchema.extend({ ROBINHOOD_OAUTH_ENCRYPTION_KEY: EncryptionKeySchema }).superRefine(enforceProductionTls);

function values(environment: Readonly<Record<string, string | undefined>>, names: readonly string[]) { return Object.fromEntries(names.map((name) => [name, environment[name]])); }
const apiNames = ['APP_MODE', 'NODE_ENV', 'DATABASE_URL', 'OWNER_CLERK_USER_ID', 'OWNER_EMAIL', 'WEB_ORIGIN', 'CLERK_PUBLISHABLE_KEY', 'CLERK_ISSUER_URL', 'CLERK_SECRET_KEY', 'CSRF_SECRET'] as const;
const workerNames = ['APP_MODE', 'NODE_ENV', 'DATABASE_URL', 'OWNER_CLERK_USER_ID', 'OWNER_EMAIL', 'ACCOUNT_REFERENCE_ENCRYPTION_KEY', 'ROBINHOOD_OAUTH_ENCRYPTION_KEY'] as const;
const enrollmentNames = ['APP_MODE', 'NODE_ENV', 'DATABASE_URL', 'OWNER_CLERK_USER_ID', 'OWNER_EMAIL', 'ROBINHOOD_OAUTH_ENCRYPTION_KEY'] as const;
export type ApiEnvironment = z.infer<typeof DemoEnvironmentSchema> | z.infer<typeof ApiConnectedSchema>;
export type WorkerEnvironment = z.infer<typeof DemoEnvironmentSchema> | z.infer<typeof WorkerConnectedSchema>;
export type EnrollmentEnvironment = z.infer<typeof DemoEnvironmentSchema> | z.infer<typeof EnrollmentConnectedSchema>;
export type AppEnvironment = ApiEnvironment | (z.infer<typeof ApiConnectedSchema> & { ACCOUNT_REFERENCE_ENCRYPTION_KEY: string; ROBINHOOD_OAUTH_ENCRYPTION_KEY: string });
function parseDemo(environment: Readonly<Record<string, string | undefined>>) { return DemoEnvironmentSchema.parse({ APP_MODE: environment.APP_MODE, NODE_ENV: environment.NODE_ENV ?? 'development' }); }
export function parseApiEnvironment(environment: Readonly<Record<string, string | undefined>>): ApiEnvironment {
  if (environment.APP_MODE === 'demo') return parseDemo(environment);
  return ApiConnectedSchema.parse(values({ ...environment, NODE_ENV: environment.NODE_ENV ?? 'development' }, apiNames));
}
export function parseWorkerEnvironment(environment: Readonly<Record<string, string | undefined>>): WorkerEnvironment {
  if (environment.APP_MODE === 'demo') return parseDemo(environment);
  return WorkerConnectedSchema.parse(values({ ...environment, NODE_ENV: environment.NODE_ENV ?? 'development' }, workerNames));
}
export function parseEnrollmentEnvironment(environment: Readonly<Record<string, string | undefined>>): EnrollmentEnvironment {
  if (environment.APP_MODE === 'demo') return parseDemo(environment);
  return EnrollmentConnectedSchema.parse(values({ ...environment, NODE_ENV: environment.NODE_ENV ?? 'development' }, enrollmentNames));
}
/** Backward-compatible full parser. Runtime entrypoints use narrower parsers. */
export function parseEnvironment(environment: Readonly<Record<string, string | undefined>>) {
  if (environment.APP_MODE === 'demo') return parseDemo(environment);
  const api = parseApiEnvironment(environment);
  const worker = parseWorkerEnvironment(environment);
  if (api.APP_MODE === 'demo' || worker.APP_MODE === 'demo') return api;
  return { ...api, ACCOUNT_REFERENCE_ENCRYPTION_KEY: worker.ACCOUNT_REFERENCE_ENCRYPTION_KEY, ROBINHOOD_OAUTH_ENCRYPTION_KEY: worker.ROBINHOOD_OAUTH_ENCRYPTION_KEY };
}
export function parseMigrationDatabaseUrl(databaseUrl: string | undefined, nodeEnvironment: string | undefined = process.env.NODE_ENV): string {
  const parsed = DatabaseUrlSchema.parse(databaseUrl);
  if (nodeEnvironment === 'production' && new URL(parsed).searchParams.get('sslmode') !== 'verify-full') throw new Error('Production DATABASE_URL must set sslmode=verify-full');
  return parsed;
}
