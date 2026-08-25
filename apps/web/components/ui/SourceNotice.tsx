import type { DataQualityReadModel, DataSourceMode } from '@aurum/domain';
import { formatDateTime } from '../../lib/formatters';

export function SourceNotice({ mode, asOf, quality }: {
  mode: DataSourceMode;
  asOf: string | null;
  quality?: DataQualityReadModel;
}) {
  const isDemo = mode === 'demo';
  return (
    <section aria-label="Data source and quality" className={`source-notice ${isDemo ? 'is-demo' : ''}`}>
      <div>
        <span className="source-badge">
          <span aria-hidden="true" className="source-dot" />
          {isDemo ? 'Synthetic Demo' : mode === 'connected' ? 'Private source' : 'Disconnected'}
        </span>
        <p>{isDemo ? 'Invented values and securities. No brokerage is connected.' : mode === 'connected' ? 'Read-only snapshot data. Verify freshness and connection health before relying on it.' : 'Last-good data is retained with an explicit disconnected state.'}</p>
      </div>
      <div className="source-meta">
        <span>As of</span>
        <strong>{formatDateTime(asOf)}</strong>
        {quality ? <small>{quality.freshness} · {quality.coverage.replaceAll('_', ' ')}</small> : null}
      </div>
    </section>
  );
}
