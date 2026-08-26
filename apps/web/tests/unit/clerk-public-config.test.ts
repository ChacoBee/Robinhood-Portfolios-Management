import { describe, expect, it } from 'vitest';
import { buildPublishableKey } from '@clerk/shared/keys';
import { readClerkPublicConfig } from '../../lib/auth/clerk-public-config';

const frontendApi = 'fixture.clerk.accounts.dev';
const publicKey = buildPublishableKey(frontendApi);

describe('public Clerk configuration', () => {
  it('fails closed when connected mode has no valid publishable key', () => {
    expect(() => readClerkPublicConfig({
      WEB_ORIGIN: 'https://portfolio.example.test',
    })).toThrow('valid Clerk publishable key');
  });

  it('accepts only an exact development loopback origin for browser redirects', () => {
    expect(readClerkPublicConfig({
      CLERK_PUBLISHABLE_KEY: publicKey,
      WEB_ORIGIN: 'http://localhost:3000',
      NODE_ENV: 'development',
    })).toMatchObject({ redirectOrigin: 'http://localhost:3000', frontendApiOrigin: `https://${frontendApi}` });
    expect(() => readClerkPublicConfig({
      CLERK_PUBLISHABLE_KEY: publicKey,
      WEB_ORIGIN: 'http://portfolio.example.test',
      NODE_ENV: 'development',
    })).toThrow('valid WEB_ORIGIN');
  });

  it('derives the exact FAPI origin from a canonical Clerk key and ignores no caller-selected host', () => {
    expect(readClerkPublicConfig({
      CLERK_PUBLISHABLE_KEY: publicKey,
      CLERK_FRONTEND_API_URL: 'https://attacker.example.test',
      WEB_ORIGIN: 'https://portfolio.example.test',
      NODE_ENV: 'production',
    })).toMatchObject({ frontendApiOrigin: `https://${frontendApi}` });
  });

  it('rejects malformed and regex-shaped but non-canonical Clerk keys', () => {
    for (const publishableKey of ['pk_live_not-base64', 'pk_live_aHR0cHM6Ly9ldmlsLmV4YW1wbGU=', 'pk_test_synthetic_public_identity_12345']) {
      expect(() => readClerkPublicConfig({ publishableKey, WEB_ORIGIN: 'https://portfolio.example.test' })).toThrow('valid Clerk publishable key');
    }
  });
});
