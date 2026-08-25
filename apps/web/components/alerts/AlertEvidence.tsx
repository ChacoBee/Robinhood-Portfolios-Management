import type { AlertReadModel } from '@aurum/domain';
import { formatDateTime, formatMoney, formatRatio } from '../../lib/formatters';
import { FinancialValue } from '../ui/FinancialValue';

export function AlertEvidence({ alert, sourceAsOf }: { alert: AlertReadModel; sourceAsOf: string | null }) {
  const evidenceAsOf = alert.evidence.sourceAsOf ?? sourceAsOf;
  return (
    <div className="alert-evidence">
      <dl>
        <div><dt>Observed</dt><dd>{formatDateTime(alert.createdAt)}</dd></div>
        <div><dt>Source as of</dt><dd>{evidenceAsOf ? formatDateTime(evidenceAsOf) : 'Unavailable'}</dd></div>
        <div><dt>Severity</dt><dd>{alert.severity}</dd></div>
        <div><dt>Evidence state</dt><dd>{alert.state === 'new' ? 'Needs review' : 'Reviewed'}</dd></div>
        <div><dt>Snapshot</dt><dd>{alert.evidence.snapshotId ?? 'Unavailable'}</dd></div>
        <div><dt>Baseline</dt><dd>{alert.evidence.baselineObservationId ?? 'Unavailable'}</dd></div>
        <div><dt>Observed value</dt><dd><FinancialValue unavailable={!alert.evidence.observedMoney} value={formatMoney(alert.evidence.observedMoney)} /></dd></div>
        <div><dt>Observed ratio</dt><dd><FinancialValue unavailable={!alert.evidence.observedRatio} value={formatRatio(alert.evidence.observedRatio)} /></dd></div>
        <div><dt>Money threshold</dt><dd><FinancialValue unavailable={!alert.evidence.thresholdMoney} value={formatMoney(alert.evidence.thresholdMoney)} /></dd></div>
        <div><dt>Ratio threshold</dt><dd><FinancialValue unavailable={!alert.evidence.thresholdRatio} value={formatRatio(alert.evidence.thresholdRatio)} /></dd></div>
        <div><dt>Flow adjustment</dt><dd><FinancialValue unavailable={!alert.evidence.flowAdjustment} value={formatMoney(alert.evidence.flowAdjustment)} /></dd></div>
        <div><dt>Scope</dt><dd>{alert.evidence.scope?.type ?? 'Unavailable'}</dd></div>
        <div><dt>Data quality</dt><dd>{alert.evidence.quality ? `${alert.evidence.quality.freshness} · ${alert.evidence.quality.coverage} · ${alert.evidence.quality.reconciliation}` : 'Unavailable'}</dd></div>
        <div><dt>Unsupported weight</dt><dd><FinancialValue unavailable={!alert.evidence.quality} value={formatRatio(alert.evidence.quality?.unsupportedWeight ?? null)} /></dd></div>
        <div><dt>Calculation</dt><dd>{alert.evidence.calculationVersion ?? 'Unavailable'}</dd></div>
      </dl>
      <p>{alert.evidence.decisionReason ?? 'This alert records an observed portfolio condition.'} It contains no forecast or trading instruction.</p>
    </div>
  );
}
