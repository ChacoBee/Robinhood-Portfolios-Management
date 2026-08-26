import { describe, expect, it } from 'vitest';
import { readClerkPublicConfig } from '../../lib/auth/clerk-public-config';

const publicKey = 'pk_test_synthetic_public_identity_12345';

describe('public Clerk configuration', () => {
  it('fails closed when connected mode has no valid publishable key', () => {
    expect(() => readClerkPublicConfig({
      CLERK_FRONTEND_API_URL: 'https://clerk.example.test',
      WEB_ORIGIN: 'https://portfolio.example.test',
    })).toThrow('valid Clerk publishable key');
  });

  it('accepts only an exact development loopback origin for browser redirects', () => {
    expect(readClerkPublicConfig({
      CLERK_PUBLISHABLE_KEY: publicKey,
      CLERK_FRONTEND_API_URL: 'https://clerk.example.test',
      WEB_ORIGIN: 'http://localhost:3000',
      NODE_ENV: 'development',
    })).toMatchObject({ redirectOrigin: 'http://localhost:3000' });
    expect(() => readClerkPublicConfig({
      CLERK_PUBLISHABLE_KEY: publicKey,
      CLERK_FRONTEND_API_URL: 'https://clerk.example.test',
      WEB_ORIGIN: 'http://portfolio.example.test',
      NODE_ENV: 'development',
    })).toThrow('valid WEB_ORIGIN');
  });
});
