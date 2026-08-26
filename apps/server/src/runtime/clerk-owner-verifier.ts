import { createClerkClient } from '@clerk/backend';
import type { AuthenticatedPrincipal } from '../auth/authorize-owner';
import type { OwnerVerificationRequest, TrustedOwnerVerifier } from '../auth/clerk-verifier';

interface ClerkAuth {
  userId?: string | null;
  sessionId?: string | null;
  sessionClaims?: Record<string, unknown> | null;
}
interface ClerkClientBoundary {
  authenticateRequest(request: Request, options: { authorizedParties: readonly string[]; acceptsToken: 'session_token' }): Promise<{ isAuthenticated: boolean; toAuth(): ClerkAuth }>;
  users: { getUser(userId: string): Promise<{ primaryEmailAddressId: string | null; emailAddresses: readonly { id: string; emailAddress: string; verification: { status: string } | null }[] }> };
}
export interface ClerkOwnerVerifierOptions {
  secretKey: string;
  publishableKey: string;
  webOrigin: string;
  issuer: string;
  ownerClerkUserId?: string;
  ownerEmail?: string;
  createClient?: (options: { secretKey: string; publishableKey: string }) => ClerkClientBoundary;
}

function fail(code: 'authentication_required' | 'verified_email_required'): never { throw new Error(code); }
function requestFrom(value: Request | OwnerVerificationRequest): Request {
  if (value instanceof Request) return value;
  return new Request(value.url, { method: value.method, headers: value.headers as HeadersInit });
}

/** API-only Clerk request verifier. It deliberately produces no passkey/MFA claim. */
export function createClerkOwnerVerifier(options: ClerkOwnerVerifierOptions): TrustedOwnerVerifier & { verify(request: Request): Promise<AuthenticatedPrincipal> } {
  const client = options.createClient?.({ secretKey: options.secretKey, publishableKey: options.publishableKey }) ?? (createClerkClient({ secretKey: options.secretKey, publishableKey: options.publishableKey }) as unknown as ClerkClientBoundary);
  return {
    async verify(input: Request | OwnerVerificationRequest): Promise<AuthenticatedPrincipal> {
      const request = requestFrom(input);
      const authenticated = await client.authenticateRequest(request, { authorizedParties: [options.webOrigin], acceptsToken: 'session_token' });
      if (!authenticated.isAuthenticated) return fail('authentication_required');
      const auth = authenticated.toAuth();
      const claims = auth.sessionClaims;
      if (!auth.userId || !auth.sessionId || !claims || claims.iss !== options.issuer || claims.azp !== options.webOrigin || typeof claims.iat !== 'number' || !Number.isFinite(claims.iat)) return fail('authentication_required');
      const user = await client.users.getUser(auth.userId);
      const primary = user.primaryEmailAddressId === null ? undefined : user.emailAddresses.find((email) => email.id === user.primaryEmailAddressId);
      if (!primary || primary.verification?.status !== 'verified') return fail('verified_email_required');
      if (options.ownerClerkUserId !== undefined && auth.userId !== options.ownerClerkUserId) throw new Error('owner_user_mismatch');
      if (options.ownerEmail !== undefined && primary.emailAddress.trim().toLowerCase() !== options.ownerEmail.trim().toLowerCase()) throw new Error('owner_email_mismatch');
      const verifiedAt = new Date(claims.iat * 1_000);
      if (!Number.isFinite(verifiedAt.valueOf())) return fail('authentication_required');
      return { clerkUserId: auth.userId, sessionId: auth.sessionId, authorizedParty: options.webOrigin, email: primary.emailAddress, emailVerified: true, authentication: { method: 'single_factor', verifiedAt: verifiedAt.toISOString() } };
    },
  };
}
