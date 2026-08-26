import type { RobinhoodOAuthStore } from '../robinhood/oauth-store';

const enrollmentFailure = 'verified_robinhood_authorization_required';

/** Fails closed unless the owner has a connected credential that decrypts to a token set. */
export async function verifyRobinhoodEnrollment(
  store: Pick<RobinhoodOAuthStore, 'load'>,
): Promise<void> {
  try {
    const grant = await store.load();
    if (
      grant?.connectionState !== 'connected' ||
      grant.tokens === null ||
      Object.keys(grant.tokens).length === 0
    ) {
      throw new Error(enrollmentFailure);
    }
  } catch {
    throw new Error(enrollmentFailure);
  }
}
