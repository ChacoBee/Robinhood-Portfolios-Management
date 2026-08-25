import type { DataQualityReadModel } from '@aurum/domain';

export function DataQualityCard({ quality }: { quality: DataQualityReadModel }) {
  const score = quality.reconciliation === 'reconciled' ? 'Reconciled' : quality.reconciliation === 'partial' ? 'Partial' : 'Unavailable';
  return (
    <aside className="quality-seal" aria-label={`Data quality: ${score}`}>
      <span aria-hidden="true" className="quality-ring">{quality.reconciliation === 'reconciled' ? '✓' : '!'}</span>
      <span>
        <small>Data quality</small>
        <strong>{score}</strong>
        <small>{quality.reasons[0] ?? 'No known limitations'}</small>
      </span>
    </aside>
  );
}
