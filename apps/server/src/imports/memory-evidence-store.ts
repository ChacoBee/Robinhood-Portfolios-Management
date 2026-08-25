import { createCipheriv, randomBytes, randomUUID } from 'node:crypto';
import type { EvidenceStore, ImportMediaType } from './contracts';

interface EncryptedEvidence {
  iv: string;
  tag: string;
  ciphertext: string;
  sha256: string;
  mediaType: ImportMediaType;
  expiresAt: string;
}

export class MemoryEvidenceStore implements EvidenceStore {
  readonly objects = new Map<string, EncryptedEvidence>();
  readonly nonReproducible = new Set<string>();

  constructor(private readonly key = randomBytes(32)) {
    if (key.byteLength !== 32) throw new TypeError('Evidence key must be 32 bytes');
  }

  async putEncrypted(input: {
    userId: string;
    content: Uint8Array;
    contentSha256: string;
    mediaType: ImportMediaType;
    expiresAt: string;
  }): Promise<{ key: string }> {
    const key = `evidence/${randomUUID()}`;
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    cipher.setAAD(Buffer.from(`${input.userId}:${input.contentSha256}`, 'utf8'));
    const ciphertext = Buffer.concat([cipher.update(input.content), cipher.final()]);
    this.objects.set(key, {
      iv: iv.toString('base64url'),
      tag: cipher.getAuthTag().toString('base64url'),
      ciphertext: ciphertext.toString('base64url'),
      sha256: input.contentSha256,
      mediaType: input.mediaType,
      expiresAt: input.expiresAt,
    });
    return { key };
  }

  async delete(key: string): Promise<void> {
    this.objects.delete(key);
  }

  async markNonReproducible(previewId: string): Promise<void> {
    this.nonReproducible.add(previewId);
  }
}
