import { NextResponse, type NextRequest } from 'next/server';
import { readClerkPublicConfig } from './lib/auth/clerk-public-config';
import { configuredDataMode } from './lib/api/data-source';

export function createBrowserContentSecurityPolicy({
  mode,
  nonce,
  clerkFrontendApiOrigin,
}: Readonly<{ mode: 'demo' | 'connected'; nonce: string; clerkFrontendApiOrigin?: string }>): string {
  if (mode === 'connected' && !clerkFrontendApiOrigin) throw new Error('Connected mode requires a valid Clerk FAPI origin.');
  const fapi = mode === 'connected' ? clerkFrontendApiOrigin : null;
  return [
    "default-src 'self'",
    "base-uri 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    "object-src 'none'",
    `img-src 'self' data:${mode === 'connected' ? ' https://img.clerk.com' : ''}`,
    "font-src 'self' data:",
    "style-src 'self' 'unsafe-inline'",
    `script-src 'nonce-${nonce}' 'strict-dynamic'${fapi ? ` ${fapi} https://challenges.cloudflare.com https://*.protect.clerk.com` : ''}`,
    `connect-src 'self'${fapi ? ` ${fapi} https://*.protect.clerk.com:*` : ''}`,
    `frame-src 'self'${fapi ? ' https://challenges.cloudflare.com https://*.protect.clerk.com' : ''}`,
    "worker-src 'self' blob:",
  ].join('; ');
}

export function proxy(request: NextRequest) {
  const nonce = crypto.randomUUID().replaceAll('-', '');
  const mode = configuredDataMode();
  const clerk = mode === 'connected' ? readClerkPublicConfig() : null;
  const policy = createBrowserContentSecurityPolicy({ mode, nonce, ...(clerk ? { clerkFrontendApiOrigin: clerk.frontendApiOrigin } : {}) });
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set('content-security-policy', policy);
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set('Content-Security-Policy', policy);
  response.headers.set('Cross-Origin-Opener-Policy', 'same-origin');
  response.headers.set('Cross-Origin-Resource-Policy', 'same-origin');
  response.headers.set(
    'Permissions-Policy',
    'camera=(), microphone=(), geolocation=(), payment=()',
  );
  response.headers.set('Referrer-Policy', 'no-referrer');
  response.headers.set(
    'Strict-Transport-Security',
    'max-age=31536000; includeSubDomains',
  );
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('X-Frame-Options', 'DENY');
  return response;
}

export const config = { matcher: '/:path*' };
