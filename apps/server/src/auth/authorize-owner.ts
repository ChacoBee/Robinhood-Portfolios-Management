export interface AuthenticatedPrincipal {
  clerkUserId: string;
  email: string;
  emailVerified: true;
  sessionId: string;
  authorizedParty: string;
  authentication: {
    method: 'passkey' | 'mfa' | 'single_factor';
    verifiedAt: string;
  };
}

export function hasRecentPasskey(
  principal: AuthenticatedPrincipal,
  now: Date,
  maximumAgeSeconds = 300,
): boolean {
  if (principal.authentication.method !== 'passkey') return false;
  const verifiedAt = Date.parse(principal.authentication.verifiedAt);
  if (!Number.isFinite(verifiedAt) || verifiedAt > now.valueOf() + 5_000) {
    return false;
  }
  return now.valueOf() - verifiedAt <= maximumAgeSeconds * 1_000;
}

export interface OwnerPrincipal extends AuthenticatedPrincipal {
  owner: true;
}

export interface OwnerAllowlist {
  clerkUserId: string;
  email: string;
  authorizedParty: string;
}

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

export function authorizeOwner(
  principal: AuthenticatedPrincipal,
  allowlist: OwnerAllowlist,
): OwnerPrincipal {
  if (principal.emailVerified !== true) throw new Error('verified_email_required');
  if (principal.clerkUserId !== allowlist.clerkUserId) throw new Error('owner_user_mismatch');
  if (normalizeEmail(principal.email) !== normalizeEmail(allowlist.email)) {
    throw new Error('owner_email_mismatch');
  }
  if (principal.authorizedParty !== allowlist.authorizedParty) {
    throw new Error('authorized_party_mismatch');
  }
  return { ...principal, email: normalizeEmail(principal.email), owner: true };
}
