import type { AlertEvaluation } from './contracts';

export function publicAlertEvidence(evaluation: AlertEvaluation) {
  const { evidence } = evaluation;
  return {
    snapshotId: evidence.snapshotId,
    baselineObservationId: evidence.baselineObservationId,
    sourceAsOf: evidence.sourceAsOf,
    observedMoney: evidence.observedMoney,
    observedRatio: evidence.observedRatio,
    thresholdMoney: evidence.thresholdMoney,
    thresholdRatio: evidence.thresholdRatio,
    flowAdjustment: evidence.flowAdjustment,
    quality: evidence.quality,
    calculationVersion: evidence.calculationVersion,
    scope: evidence.scope,
    decisionReason: evaluation.reason,
  };
}
