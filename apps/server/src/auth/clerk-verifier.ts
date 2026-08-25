import type { AuthenticatedPrincipal } from './authorize-owner';

export interface OwnerVerificationRequest {
  method: string;
  url: string;
  headers: Readonly<Record<string, string | readonly string[] | undefined>>;
  expectedAuthorizedParty: string;
  expectedIssuer: string;
}

/**
 * A process-local trust boundary implemented by the deployment composition.
 * Implementations must cryptographically validate the Clerk session before
 * returning a principal. The API never constructs one from request claims.
 */
export interface TrustedOwnerVerifier {
  verify(request: OwnerVerificationRequest): Promise<AuthenticatedPrincipal>;
}

interface ClerkAuthResult {
  isAuthenticated: boolean;
  userId: string | null;
  sessionId: string | null;
  authorizedParty: string | null;
  authentication: AuthenticatedPrincipal['authentication'] | null;
}

interface ClerkUserResult {
  primaryEmailAddress: { emailAddress: string; verification: { status: string } | null } | null;
}

export interface ClerkBackendBoundary {
  authenticateRequest(
    request: Request,
    options: { authorizedParties: readonly string[] },
  ): Promise<ClerkAuthResult>;
  getUser(userId: string): Promise<ClerkUserResult>;
}

export async function verifyClerkPrincipal(
  request: Request,
  client: ClerkBackendBoundary,
  authorizedParty: string,
): Promise<AuthenticatedPrincipal> {
  const auth = await client.authenticateRequest(request, {
    authorizedParties: [authorizedParty],
  });
  if (
    !auth.isAuthenticated ||
    !auth.userId ||
    !auth.sessionId ||
    !auth.authentication ||
    auth.authorizedParty !== authorizedParty
  ) {
    throw new Error('unauthenticated');
  }
  const user = await client.getUser(auth.userId);
  const primaryEmail = user.primaryEmailAddress;
  if (!primaryEmail || primaryEmail.verification?.status !== 'verified') {
    throw new Error('verified_email_required');
  }
  return {
    clerkUserId: auth.userId,
    sessionId: auth.sessionId,
    authorizedParty,
    email: primaryEmail.emailAddress,
    emailVerified: true,
    authentication: auth.authentication,
  };
}
