import type {
  AlertEvaluation,
  DeliveryRecord,
  FactualAlertRule,
  NotificationAdapter,
  NotificationEvent,
} from './contracts';
import { decideDelivery } from './delivery-policy';

export async function deliverAlert(
  event: NotificationEvent,
  rule: FactualAlertRule,
  adapters: readonly NotificationAdapter[],
  history: readonly DeliveryRecord[],
  nowUtc: Date,
  mutedUntil: string | null = null,
) {
  const results = [];
  for (const adapter of adapters) {
    const decision = decideDelivery(event.evaluation, history, nowUtc, {
      rule,
      channel: adapter.channel,
      channelAvailable: adapter.configured,
      mutedUntil,
    });
    if (!decision.deliver) {
      results.push({
        channel: adapter.channel,
        state: 'disabled' as const,
        providerMessageId: null,
        reason: decision.reason,
      });
      continue;
    }
    results.push(await adapter.send(event));
  }
  return results;
}

export function sparseExternalMessage(evaluation: AlertEvaluation): string {
  return `Aurum recorded a ${evaluation.state.replaceAll('_', ' ')}. Open the private dashboard to review evidence.`;
}
