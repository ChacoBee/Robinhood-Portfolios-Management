import type { DeliveryResult, NotificationAdapter, NotificationEvent } from '../alerts/contracts';

export class InAppNotificationAdapter implements NotificationAdapter {
  readonly channel = 'in_app' as const;
  readonly configured = true;
  readonly events: NotificationEvent[] = [];

  async send(event: NotificationEvent): Promise<DeliveryResult> {
    this.events.push(event);
    return {
      channel: this.channel,
      state: 'delivered',
      providerMessageId: event.id,
      reason: 'stored in the private alert inbox',
    };
  }
}
