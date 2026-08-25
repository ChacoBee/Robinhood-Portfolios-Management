import { z } from 'zod';

const NodeEnvironmentSchema = z.enum(['development', 'test', 'production']);

const DemoEnvironmentSchema = z.object({
  APP_MODE: z.literal('demo'),
  NODE_ENV: NodeEnvironmentSchema,
});

const ConnectedEnvironmentSchema = z.object({
  APP_MODE: z.literal('connected'),
  NODE_ENV: NodeEnvironmentSchema,
  DATABASE_URL: z.string().url(),
  OWNER_EMAIL: z.string().email(),
  CLERK_SECRET_KEY: z.string().min(20),
  ACCOUNT_REFERENCE_ENCRYPTION_KEY: z.string().refine((value) => {
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(value)) return false;
    return Buffer.from(value, 'base64').length === 32;
  }, 'Must be a base64-encoded 32-byte key'),
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
    OWNER_EMAIL: environment.OWNER_EMAIL,
    CLERK_SECRET_KEY: environment.CLERK_SECRET_KEY,
    ACCOUNT_REFERENCE_ENCRYPTION_KEY:
      environment.ACCOUNT_REFERENCE_ENCRYPTION_KEY,
  });
}
