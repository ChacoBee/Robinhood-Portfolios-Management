'use client';

import * as React from 'react';
import { ClerkProvider, SignIn, UserButton, useAuth, type ClerkProviderProps } from '@clerk/react';
import { usePathname, useRouter } from 'next/navigation';
import { DashboardShell } from '../app-shell/DashboardShell';
import { ClerkLoadingScreen } from './ClerkAuthBoundary';

type ConnectedClerkBoundaryProps = Readonly<{
  children: React.ReactNode;
  apiBaseUrl: string;
  nonce?: string;
  publishableKey: string;
  redirectOrigin: string;
}>;

function ConnectedContent({ children, apiBaseUrl }: Pick<ConnectedClerkBoundaryProps, 'children' | 'apiBaseUrl'>) {
  const { isLoaded, isSignedIn } = useAuth();
  const pathname = usePathname() ?? '/';
  const router = useRouter();
  const signInRoute = pathname === '/sign-in' || pathname.startsWith('/sign-in/');
  React.useEffect(() => {
    if (!isLoaded) return;
    if (!isSignedIn && !signInRoute) router.replace('/sign-in');
    if (isSignedIn && signInRoute) router.replace('/');
  }, [isLoaded, isSignedIn, router, signInRoute]);
  if (!isLoaded) return <ClerkLoadingScreen />;
  if (!isSignedIn) return signInRoute ? <SignIn path="/sign-in" routing="path" transferable={false} withSignUp={false} /> : null;
  if (signInRoute) return null;
  return <DashboardShell apiBaseUrl={apiBaseUrl} mode="connected" userControl={<UserButton />}>{children}</DashboardShell>;
}

export function ConnectedClerkBoundary({ children, apiBaseUrl, nonce, publishableKey, redirectOrigin }: ConnectedClerkBoundaryProps) {
  const router = useRouter();
  const providerProps = {
    publishableKey, signInUrl: '/sign-in', signInFallbackRedirectUrl: '/', afterSignOutUrl: '/sign-in',
    allowedRedirectOrigins: [redirectOrigin], routerPush: (to: string) => router.push(to), routerReplace: (to: string) => router.replace(to),
    telemetry: false, ...(nonce ? { nonce } : {}),
  } satisfies Omit<ClerkProviderProps, 'children'>;
  return <ClerkProvider {...providerProps}><ConnectedContent apiBaseUrl={apiBaseUrl}>{children}</ConnectedContent></ClerkProvider>;
}
