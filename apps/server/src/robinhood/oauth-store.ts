import type { OAuthCredentialRepository } from '../db/repositories';
import { AesGcmOAuthCrypto } from './oauth-crypto';

const provider = 'robinhood' as const;

export interface RobinhoodOAuthGrant {
  clientInformation: Record<string, unknown> | null;
  tokens: Record<string, unknown> | null;
  connectionState: 'enrolling' | 'connected';
  tokenUpdatedAt: string | null;
  lastHeartbeatAt: string | null;
}

function toIso(value: string | Date | null): string | null {
  return value === null ? null : new Date(value).toISOString();
}

export class RobinhoodOAuthStore {
  private readonly crypto: AesGcmOAuthCrypto;

  constructor(
    private readonly credentials: OAuthCredentialRepository,
    private readonly ownerId: string,
    encryptionKey: string,
  ) {
    this.crypto = new AesGcmOAuthCrypto(encryptionKey);
  }

  async load(): Promise<RobinhoodOAuthGrant | null> {
    const row = await this.credentials.load(this.ownerId, provider);
    if (!row) return null;
    return {
      clientInformation:
        row.clientInformation === null
          ? null
          : this.crypto.open(
              { ownerId: this.ownerId, provider, recordKind: 'client_information' },
              row.clientInformation,
            ),
      tokens:
        row.tokenSet === null
          ? null
          : this.crypto.open(
              { ownerId: this.ownerId, provider, recordKind: 'tokens' },
              row.tokenSet,
            ),
      connectionState: row.connectionState,
      tokenUpdatedAt: toIso(row.tokenUpdatedAt),
      lastHeartbeatAt: toIso(row.lastHeartbeatAt),
    };
  }

  async saveClientInformation(clientInformation: Record<string, unknown>): Promise<void> {
    await this.credentials.saveClientInformation(
      this.ownerId,
      provider,
      this.crypto.seal(
        { ownerId: this.ownerId, provider, recordKind: 'client_information' },
        clientInformation,
      ),
    );
  }

  async saveTokens(tokens: Record<string, unknown>): Promise<void> {
    await this.credentials.saveTokens(
      this.ownerId,
      provider,
      this.crypto.seal({ ownerId: this.ownerId, provider, recordKind: 'tokens' }, tokens),
    );
  }

  async markHeartbeat(): Promise<void> {
    await this.credentials.markHeartbeat(this.ownerId, provider);
  }

  async disconnect(): Promise<void> {
    await this.credentials.disconnect(this.ownerId, provider);
  }
}
