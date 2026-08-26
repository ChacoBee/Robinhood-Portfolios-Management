import { describe, expect, it } from 'vitest';
import { createBrowserContentSecurityPolicy } from '../../proxy';

describe('browser content security policy', () => {
  it('keeps demo CSP free of Clerk hosts and carries the request nonce', () => {
    const policy = createBrowserContentSecurityPolicy({ mode: 'demo', nonce: 'nonce-1' });

    expect(policy).toContain("script-src 'nonce-nonce-1' 'strict-dynamic'");
    expect(policy).not.toContain('clerk');
    expect(policy).not.toContain('*.clerk.accounts.dev');
  });

  it('allows only the configured Clerk frontend origin in connected CSP', () => {
    const policy = createBrowserContentSecurityPolicy({
      mode: 'connected',
      nonce: 'nonce-2',
      clerkFrontendApiOrigin: 'https://clerk.example.test',
    });

    expect(policy).toContain('https://clerk.example.test');
    expect(policy).not.toContain('*.clerk.accounts.dev');
  });
});
