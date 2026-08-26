'use client';

import * as React from 'react';
import { DashboardShell } from '../app-shell/DashboardShell';
import { isValidClerkPublishableKey } from '../../lib/auth/clerk-public-config';

const ConnectedClerkBoundary = React.lazy(async () => {
  const connectedBoundary = await import('./ConnectedClerkBoundary');
  return { default: connectedBoundary.ConnectedClerkBoundary };
});

export type ClerkAuthBoundaryProps = Readonly<{
  children: React.ReactNode;
  mode: 'demo' | 'connected';
  apiBaseUrl: string;
  publishableKey?: string;
  nonce?: string;
  redirectOrigin?: string;
}>;

export function ClerkLoadingScreen() {
  return <main aria-busy="true" aria-live="polite" role="status">Loading secure workspace…</main>;
}

export function ClerkAuthBoundary({ children, mode, apiBaseUrl, publishableKey, nonce, redirectOrigin }: ClerkAuthBoundaryProps) {
  if (mode === 'demo') return <DashboardShell apiBaseUrl={apiBaseUrl} mode={mode}>{children}</DashboardShell>;
  if (!isValidClerkPublishableKey(publishableKey)) throw new Error('Connected mode requires a valid Clerk publishable key.');
  if (!redirectOrigin) throw new Error('Connected mode requires a valid WEB_ORIGIN.');
  return (
    <React.Suspense fallback={<ClerkLoadingScreen />}>
      <ConnectedClerkBoundary apiBaseUrl={apiBaseUrl} publishableKey={publishableKey} redirectOrigin={redirectOrigin} {...(nonce ? { nonce } : {})}>{children}</ConnectedClerkBoundary>
    </React.Suspense>
  );
}
