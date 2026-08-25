import type { RobinhoodReadScope } from './read-methods';

export type RobinhoodGrantVerification =
  | 'signed_claims'
  | 'oauth_introspection';

/**
 * Evidence returned only after a trusted server-side provider has verified the
 * live OAuth grant. It is never constructed from public input or env scopes.
 */
export interface VerifiedRobinhoodAuthorizationGrant {
  header: `Bearer ${string}`;
  actualScopes: readonly string[];
  issuer: string;
  audience: string;
  expiresAt: string;
  verification: RobinhoodGrantVerification;
  authorizedEndpointOrigin: string;
}

export interface RobinhoodAuthorizationRequest {
  endpointOrigin: string;
  expectedIssuer: string;
  expectedAudience: string;
  requiredScopes: readonly RobinhoodReadScope[];
}

export interface VerifiedRobinhoodAuthorizationProvider {
  getVerifiedAuthorization(
    request: RobinhoodAuthorizationRequest,
  ): Promise<VerifiedRobinhoodAuthorizationGrant>;
}
