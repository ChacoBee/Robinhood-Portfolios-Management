import { randomBytes, randomUUID, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';

export interface StoredRecoveryCode {
  id: string;
  ownerId: string;
  salt: string;
  digest: string;
  consumedAt: string | null;
  createdAt: string;
}

export interface RecoveryCodeStore {
  replaceOwnerCodes(ownerId: string, codes: readonly StoredRecoveryCode[]): Promise<void>;
  consumeMatching(
    ownerId: string,
    matches: (code: StoredRecoveryCode) => Promise<boolean>,
    consumedAt: string,
  ): Promise<StoredRecoveryCode | null>;
}

export interface RecoverySession {
  id: string;
  ownerId: string;
  expiresAt: string;
  capabilities: readonly ['passkey_reenrollment'];
}

function encodeCode(bytes: Uint8Array): string {
  return Buffer.from(bytes)
    .toString('hex')
    .toUpperCase()
    .match(/.{1,4}/g)!
    .join('-');
}

async function derive(code: string, salt: string, pepper: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCallback(
      `${pepper}:${code.trim().toUpperCase()}`,
      salt,
      32,
      { N: 1 << 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 },
      (error, key) => (error ? reject(error) : resolve(key)),
    );
  });
}

export async function createRecoveryCodes(
  ownerId: string,
  store: RecoveryCodeStore,
  pepper: string,
  now = new Date(),
  count = 10,
): Promise<readonly string[]> {
  if (pepper.length < 32) throw new TypeError('Recovery-code pepper must be at least 32 characters');
  if (!Number.isInteger(count) || count < 1 || count > 20) throw new TypeError('Invalid code count');
  const plaintext = Array.from({ length: count }, () => encodeCode(randomBytes(12)));
  const records: StoredRecoveryCode[] = [];
  for (const code of plaintext) {
    const salt = randomBytes(16).toString('base64url');
    records.push({
      id: randomUUID(),
      ownerId,
      salt,
      digest: (await derive(code, salt, pepper)).toString('base64url'),
      consumedAt: null,
      createdAt: now.toISOString(),
    });
  }
  await store.replaceOwnerCodes(ownerId, records);
  return plaintext;
}

export async function consumeRecoveryCode(
  input: {
    ownerId: string;
    code: string;
    verifiedEmailProof: boolean;
  },
  dependencies: {
    store: RecoveryCodeStore;
    pepper: string;
    revokeOwnerSessions(ownerId: string): Promise<void>;
    saveRestrictedSession(session: RecoverySession): Promise<void>;
    now?: () => Date;
  },
): Promise<RecoverySession> {
  if (!input.verifiedEmailProof) throw new Error('verified_email_proof_required');
  const now = dependencies.now?.() ?? new Date();
  const matched = await dependencies.store.consumeMatching(
    input.ownerId,
    async (stored) => {
      if (stored.consumedAt !== null) return false;
      const actual = await derive(input.code, stored.salt, dependencies.pepper);
      const expected = Buffer.from(stored.digest, 'base64url');
      return expected.byteLength === actual.byteLength && timingSafeEqual(expected, actual);
    },
    now.toISOString(),
  );
  if (!matched) throw new Error('invalid_or_consumed_recovery_code');

  await dependencies.revokeOwnerSessions(input.ownerId);
  const session: RecoverySession = {
    id: randomUUID(),
    ownerId: input.ownerId,
    expiresAt: new Date(now.valueOf() + 10 * 60 * 1_000).toISOString(),
    capabilities: ['passkey_reenrollment'],
  };
  await dependencies.saveRestrictedSession(session);
  return session;
}

export class MemoryRecoveryCodeStore implements RecoveryCodeStore {
  private readonly byOwner = new Map<string, StoredRecoveryCode[]>();

  async replaceOwnerCodes(ownerId: string, codes: readonly StoredRecoveryCode[]): Promise<void> {
    this.byOwner.set(ownerId, codes.map((code) => ({ ...code })));
  }

  async consumeMatching(
    ownerId: string,
    matches: (code: StoredRecoveryCode) => Promise<boolean>,
    consumedAt: string,
  ): Promise<StoredRecoveryCode | null> {
    const codes = this.byOwner.get(ownerId) ?? [];
    for (const code of codes) {
      if (await matches(code)) {
        if (code.consumedAt !== null) return null;
        code.consumedAt = consumedAt;
        return { ...code };
      }
    }
    return null;
  }

  snapshot(ownerId: string): readonly StoredRecoveryCode[] {
    return (this.byOwner.get(ownerId) ?? []).map((code) => ({ ...code }));
  }
}
