import { z } from 'zod';

const NodeEnvironmentSchema = z.enum(['development', 'test', 'production']);

const DemoEnvironmentSchema = z.object({
  APP_MODE: z.literal('demo'),
  NODE_ENV: NodeEnvironmentSchema,
});

const NormalizedEmailSchema = z
  .string()
  .transform((value) => value.trim().toLowerCase())
  .pipe(z.string().email());

const DatabaseUrlSchema = z.string().url().superRefine((value, context) => {
  const protocol = new URL(value).protocol;
  if (protocol !== 'postgresql:' && protocol !== 'postgres:') {
    context.addIssue({
      code: 'custom',
      message: 'DATABASE_URL must use the PostgreSQL scheme',
    });
  }
});

export function parseMigrationDatabaseUrl(
  databaseUrl: string | undefined,
  nodeEnvironment: string | undefined = process.env.NODE_ENV,
): string {
  const parsed = DatabaseUrlSchema.parse(databaseUrl);
  if (
    nodeEnvironment === 'production' &&
    new URL(parsed).searchParams.get('sslmode') !== 'verify-full'
  ) {
    throw new Error('Production DATABASE_URL must set sslmode=verify-full');
  }
  return parsed;
}

function exactHttpsOrigin(name: string) {
  return z.string().url().superRefine((value, context) => {
    let url: URL;
    try {
      url = new URL(value);
    } catch {
      context.addIssue({
        code: 'custom',
        message: `${name} must be an exact HTTPS origin`,
      });
      return;
    }
    if (
      url.protocol !== 'https:' ||
      url.username !== '' ||
      url.password !== '' ||
      url.origin !== value
    ) {
      context.addIssue({
        code: 'custom',
        message: `${name} must be an exact HTTPS origin`,
      });
    }
  });
}

const ConnectedEnvironmentSchema = z.object({
  APP_MODE: z.literal('connected'),
  NODE_ENV: NodeEnvironmentSchema,
  DATABASE_URL: DatabaseUrlSchema,
  OWNER_CLERK_USER_ID: z.string().regex(/^user_[A-Za-z0-9_-]{3,}$/),
  OWNER_EMAIL: NormalizedEmailSchema,
  WEB_ORIGIN: exactHttpsOrigin('WEB_ORIGIN'),
  CLERK_PUBLISHABLE_KEY: z
    .string()
    .regex(/^pk_(?:test|live)_[A-Za-z0-9_-]{10,}$/),
  CLERK_ISSUER_URL: exactHttpsOrigin('CLERK_ISSUER_URL'),
  CLERK_SECRET_KEY: z.string().min(20),
  CSRF_SECRET: z.string().min(32),
  ACCOUNT_REFERENCE_ENCRYPTION_KEY: z.string().refine((value) => {
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(value)) return false;
    return Buffer.from(value, 'base64').length === 32;
  }, 'Must be a base64-encoded 32-byte key'),
  ROBINHOOD_OAUTH_ENCRYPTION_KEY: z.string().refine((value) => {
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(value)) return false;
    return Buffer.from(value, 'base64').length === 32;
  }, 'Must be a base64-encoded 32-byte key'),
}).superRefine((value, context) => {
  if (
    value.NODE_ENV === 'production' &&
    new URL(value.DATABASE_URL).searchParams.get('sslmode') !== 'verify-full'
  ) {
    context.addIssue({
      code: 'custom',
      path: ['DATABASE_URL'],
      message: 'Production DATABASE_URL must set sslmode=verify-full',
    });
  }
});

export const EnvironmentSchema = z.discriminatedUnion('APP_MODE', [
  DemoEnvironmentSchema,
  ConnectedEnvironmentSchema,
]);

export type AppEnvironment = z.infer<typeof EnvironmentSchema>;

export function parseEnvironment(
  environment: Readonly<Record<string, string | undefined>>,
): AppEnvironment {
  const appMode = environment.APP_MODE;
  const nodeEnvironment = environment.NODE_ENV ?? 'development';

  if (appMode === 'demo') {
    return DemoEnvironmentSchema.parse({
      APP_MODE: appMode,
      NODE_ENV: nodeEnvironment,
    });
  }

  return ConnectedEnvironmentSchema.parse({
    APP_MODE: appMode,
    NODE_ENV: nodeEnvironment,
    DATABASE_URL: environment.DATABASE_URL,
    OWNER_CLERK_USER_ID: environment.OWNER_CLERK_USER_ID,
    OWNER_EMAIL: environment.OWNER_EMAIL,
    WEB_ORIGIN: environment.WEB_ORIGIN,
    CLERK_PUBLISHABLE_KEY: environment.CLERK_PUBLISHABLE_KEY,
    CLERK_ISSUER_URL: environment.CLERK_ISSUER_URL,
    CLERK_SECRET_KEY: environment.CLERK_SECRET_KEY,
    CSRF_SECRET: environment.CSRF_SECRET,
    ACCOUNT_REFERENCE_ENCRYPTION_KEY:
      environment.ACCOUNT_REFERENCE_ENCRYPTION_KEY,
    ROBINHOOD_OAUTH_ENCRYPTION_KEY:
      environment.ROBINHOOD_OAUTH_ENCRYPTION_KEY,
  });
}
