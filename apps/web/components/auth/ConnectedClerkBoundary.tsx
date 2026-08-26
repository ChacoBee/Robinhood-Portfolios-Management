'use client';

import * as React from 'react';
import { ClerkProvider, SignIn, UserButton, useAuth, type ClerkProviderProps } from '@clerk/react';
import { DashboardShell } from '../app-shell/DashboardShell';
import { ClerkLoadingScreen } from './ClerkAuthBoundary';

type ConnectedClerkBoundaryProps = Readonly<{
  children: React.ReactNode;
  apiBaseUrl: string;
  nonce?: string;
  publishableKey: string;
  redirectOrigin: string;
}>;

function currentPathname(): string {
  return typeof window === 'undefined' ? '/' : window.location.pathname;
}

function navigate(to: string, replace: boolean) {
  const destination = new URL(to, window.location.origin);
  const target = `${destination.pathname}${destination.search}${destination.hash}`;
  window.history[replace ? 'replaceState' : 'pushState']({}, '', target);
  window.dispatchEvent(new PopStateEvent('popstate'));
}

function ConnectedContent({ children, apiBaseUrl }: Pick<ConnectedClerkBoundaryProps, 'children' | 'apiBaseUrl'>) {
  const { isLoaded, isSignedIn } = useAuth();
  const [pathname, setPathname] = React.useState(currentPathname);
  React.useEffect(() => {
    const onPopState = () => setPathname(currentPathname());
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);
  const signInRoute = pathname === '/sign-in' || pathname.startsWith('/sign-in/');
  React.useEffect(() => {
    if (!isLoaded) return;
    if (!isSignedIn && !signInRoute) navigate('/sign-in', true);
    if (isSignedIn && signInRoute) navigate('/', true);
  }, [isLoaded, isSignedIn, signInRoute]);
  if (!isLoaded) return <ClerkLoadingScreen />;
  if (!isSignedIn) return signInRoute ? <SignIn path="/sign-in" routing="path" transferable={false} withSignUp={false} /> : null;
  if (signInRoute) return null;
  return <DashboardShell apiBaseUrl={apiBaseUrl} mode="connected" userControl={<UserButton />}>{children}</DashboardShell>;
}

export function ConnectedClerkBoundary({ children, apiBaseUrl, nonce, publishableKey, redirectOrigin }: ConnectedClerkBoundaryProps) {
  const providerProps = {
    publishableKey, signInUrl: '/sign-in', signInFallbackRedirectUrl: '/', afterSignOutUrl: '/sign-in',
    allowedRedirectOrigins: [redirectOrigin], routerPush: (to: string) => navigate(to, false), routerReplace: (to: string) => navigate(to, true),
    telemetry: false, nonce, dynamic: true,
  } as ClerkProviderProps & { dynamic: boolean; nonce?: string };
  return <ClerkProvider {...providerProps}><ConnectedContent apiBaseUrl={apiBaseUrl}>{children}</ConnectedContent></ClerkProvider>;
}
