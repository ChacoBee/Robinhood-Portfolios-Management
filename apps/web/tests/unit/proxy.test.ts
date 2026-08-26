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

    expect(policy).toContain("script-src 'nonce-nonce-2' 'strict-dynamic' https://clerk.example.test https://challenges.cloudflare.com https://*.protect.clerk.com");
    expect(policy).toContain("connect-src 'self' https://clerk.example.test https://*.protect.clerk.com:*");
    expect(policy).toContain("img-src 'self' data: https://img.clerk.com");
    expect(policy).toContain("frame-src 'self' https://challenges.cloudflare.com https://*.protect.clerk.com");
    expect(policy).not.toContain(' ws:');
    expect(policy).not.toContain(' wss:');
    expect(policy).not.toContain('*.clerk.accounts.dev');
  });
});
