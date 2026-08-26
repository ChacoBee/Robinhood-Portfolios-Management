import type { RobinhoodOAuthStore } from '../robinhood/oauth-store';

const enrollmentFailure = 'verified_robinhood_authorization_required';

function isNonEmptyRecord(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    Object.keys(value).length > 0
  );
}

/** Fails closed unless the owner has a connected, decryptable OAuth grant. */
export async function verifyRobinhoodEnrollment(
  store: Pick<RobinhoodOAuthStore, 'load'>,
): Promise<void> {
  try {
    const grant = await store.load();
    if (
      grant?.connectionState !== 'connected' ||
      !isNonEmptyRecord(grant.clientInformation) ||
      !isNonEmptyRecord(grant.tokens)
    ) {
      throw new Error(enrollmentFailure);
    }
  } catch {
    throw new Error(enrollmentFailure);
  }
}
