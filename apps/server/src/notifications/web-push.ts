import type { DeliveryResult, NotificationAdapter, NotificationEvent } from '../alerts/contracts';
import { sparseExternalMessage } from '../alerts/service';

export interface SparsePushClient {
  send(input: { title: string; body: string; path: string }): Promise<{ id: string }>;
}

export class WebPushAdapter implements NotificationAdapter {
  readonly channel = 'web_push' as const;
  readonly configured: boolean;

  constructor(private readonly client: SparsePushClient | null) {
    this.configured = client !== null;
  }

  async send(event: NotificationEvent): Promise<DeliveryResult> {
    if (!this.client) {
      return {
        channel: this.channel,
        state: 'disabled',
        providerMessageId: null,
        reason: 'web push is not configured',
      };
    }
    const delivery = await this.client.send({
      title: 'Aurum portfolio alert',
      body: sparseExternalMessage(event.evaluation),
      path: event.evidenceUrl,
    });
    return {
      channel: this.channel,
      state: 'delivered',
      providerMessageId: delivery.id,
      reason: 'sent without balances or account identifiers',
    };
  }
}
