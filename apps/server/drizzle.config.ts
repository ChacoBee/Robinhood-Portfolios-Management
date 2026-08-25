import { defineConfig } from 'drizzle-kit';
import { parseMigrationDatabaseUrl } from './src/config';

const databaseUrl = process.env.DATABASE_URL
  ? parseMigrationDatabaseUrl(process.env.DATABASE_URL, process.env.NODE_ENV)
  : null;

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema.ts',
  out: './drizzle',
  strict: true,
  verbose: true,
  ...(databaseUrl ? { dbCredentials: { url: databaseUrl } } : {}),
});
