import { randomUUID } from 'node:crypto';
import type { EvidenceStore, ImportMediaType } from './contracts';

export interface PrivateObjectClient {
  putObject(input: {
    bucket: string;
    key: string;
    body: Uint8Array;
    contentType: string;
    serverSideEncryption: 'AES256' | 'aws:kms';
    kmsKeyId?: string;
    metadata: Readonly<Record<string, string>>;
    expiresAt: string;
  }): Promise<void>;
  deleteObject(input: { bucket: string; key: string }): Promise<void>;
}

export class S3EvidenceStore implements EvidenceStore {
  constructor(
    private readonly client: PrivateObjectClient,
    private readonly options: { bucket: string; kmsKeyId?: string },
    private readonly markDeleted: (previewId: string) => Promise<void>,
  ) {
    if (!options.bucket.trim()) throw new TypeError('A private evidence bucket is required');
  }

  async putEncrypted(input: {
    userId: string;
    content: Uint8Array;
    contentSha256: string;
    mediaType: ImportMediaType;
    expiresAt: string;
  }): Promise<{ key: string }> {
    const key = `aurum-import-evidence/${randomUUID()}`;
    await this.client.putObject({
      bucket: this.options.bucket,
      key,
      body: input.content,
      contentType: input.mediaType,
      serverSideEncryption: this.options.kmsKeyId ? 'aws:kms' : 'AES256',
      ...(this.options.kmsKeyId ? { kmsKeyId: this.options.kmsKeyId } : {}),
      metadata: { sha256: input.contentSha256, owner: input.userId },
      expiresAt: input.expiresAt,
    });
    return { key };
  }

  async delete(key: string): Promise<void> {
    await this.client.deleteObject({ bucket: this.options.bucket, key });
  }

  async markNonReproducible(previewId: string): Promise<void> {
    await this.markDeleted(previewId);
  }
}
