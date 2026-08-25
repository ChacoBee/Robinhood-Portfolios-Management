import type { DeliveryResult, NotificationAdapter, NotificationEvent } from '../alerts/contracts';
import { sparseExternalMessage } from '../alerts/service';

export interface SparseEmailClient {
  send(input: { to: string; subject: string; text: string }): Promise<{ id: string }>;
}

export class ResendEmailAdapter implements NotificationAdapter {
  readonly channel = 'email' as const;
  readonly configured: boolean;

  constructor(
    private readonly client: SparseEmailClient | null,
    private readonly ownerEmail: string | null,
  ) {
    this.configured = client !== null && ownerEmail !== null;
  }

  async send(event: NotificationEvent): Promise<DeliveryResult> {
    if (!this.client || !this.ownerEmail) {
      return {
        channel: this.channel,
        state: 'disabled',
        providerMessageId: null,
        reason: 'email is not configured',
      };
    }
    const delivery = await this.client.send({
      to: this.ownerEmail,
      subject: 'Aurum portfolio alert',
      text: `${sparseExternalMessage(event.evaluation)}\n${event.evidenceUrl}`,
    });
    return {
      channel: this.channel,
      state: 'delivered',
      providerMessageId: delivery.id,
      reason: 'sent without balances or account identifiers',
    };
  }
}
