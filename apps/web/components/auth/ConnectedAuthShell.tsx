import { headers } from 'next/headers';
import { readClerkPublicConfig } from '../../lib/auth/clerk-public-config';
import { ClerkAuthBoundary } from './ClerkAuthBoundary';

export default async function ConnectedAuthShell({ children }: Readonly<{ children: React.ReactNode }>) {
  const clerk = readClerkPublicConfig();
  const nonce = (await headers()).get('x-nonce') ?? undefined;
  return (
    <ClerkAuthBoundary
      apiBaseUrl="/api/aurum"
      mode="connected"
      {...(nonce ? { nonce } : {})}
      publishableKey={clerk.publishableKey}
      redirectOrigin={clerk.redirectOrigin}
    >{children}</ClerkAuthBoundary>
  );
}
