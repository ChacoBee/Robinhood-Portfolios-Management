import { describe, expect, it, vi } from 'vitest';
import {
  MemoryRecoveryCodeStore,
  assertRecoveryCapability,
  consumeRecoveryCode,
  createRecoveryCodes,
  type RecoverySession,
} from '../../../src/auth';

const pepper = 'synthetic-test-pepper-is-long-enough-123456';

describe('recovery codes', () => {
  it('stores slow hashes, requires dual proof, consumes once, and revokes sessions', async () => {
    const store = new MemoryRecoveryCodeStore();
    const [code] = await createRecoveryCodes('owner-a', store, pepper, new Date(), 2);
    expect(code).toMatch(/^[A-F0-9]{4}(?:-[A-F0-9]{4}){5}$/);
    expect(JSON.stringify(store.snapshot('owner-a'))).not.toContain(code);

    await expect(
      consumeRecoveryCode(
        { ownerId: 'owner-a', code: code!, verifiedEmailProof: false },
        {
          store,
          pepper,
          revokeOwnerSessions: vi.fn(),
          saveRestrictedSession: vi.fn(),
        },
      ),
    ).rejects.toThrow(/email_proof/);

    const revokeOwnerSessions = vi.fn();
    const sessions: RecoverySession[] = [];
    const session = await consumeRecoveryCode(
      { ownerId: 'owner-a', code: code!, verifiedEmailProof: true },
      {
        store,
        pepper,
        revokeOwnerSessions,
        saveRestrictedSession: async (value) => void sessions.push(value),
        now: () => new Date('2026-08-25T12:00:00.000Z'),
      },
    );
    expect(revokeOwnerSessions).toHaveBeenCalledWith('owner-a');
    expect(session.capabilities).toEqual(['passkey_reenrollment']);
    expect(sessions).toEqual([session]);

    await expect(
      consumeRecoveryCode(
        { ownerId: 'owner-a', code: code!, verifiedEmailProof: true },
        {
          store,
          pepper,
          revokeOwnerSessions,
          saveRestrictedSession: vi.fn(),
        },
      ),
    ).rejects.toThrow(/consumed/);
  });

  it('restricts recovery sessions to passkey reenrollment and ten minutes', () => {
    const session: RecoverySession = {
      id: 'recovery-a',
      ownerId: 'owner-a',
      expiresAt: '2026-08-25T12:10:00.000Z',
      capabilities: ['passkey_reenrollment'],
    };
    expect(() =>
      assertRecoveryCapability(
        session,
        'passkey_reenrollment',
        new Date('2026-08-25T12:09:59.000Z'),
      ),
    ).not.toThrow();
    expect(() =>
      assertRecoveryCapability(session, 'export_data', new Date('2026-08-25T12:05:00.000Z')),
    ).toThrow(/capability_denied/);
    expect(() =>
      assertRecoveryCapability(
        session,
        'passkey_reenrollment',
        new Date('2026-08-25T12:10:00.000Z'),
      ),
    ).toThrow(/expired/);
  });
});
