import type { RecoverySession } from './recovery-codes';

export function assertRecoveryCapability(
  session: RecoverySession,
  capability: string,
  now = new Date(),
): void {
  if (new Date(session.expiresAt) <= now) throw new Error('recovery_session_expired');
  if (!session.capabilities.includes(capability as 'passkey_reenrollment')) {
    throw new Error('recovery_capability_denied');
  }
}
