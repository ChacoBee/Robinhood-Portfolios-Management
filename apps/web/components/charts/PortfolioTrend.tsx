import type { TrendPointReadModel } from '@aurum/domain';
import { formatCompactMoney, formatMoney } from '../../lib/formatters';
import { FinancialValue } from '../ui/FinancialValue';

function chartCoordinates(points: TrendPointReadModel[]) {
  if (points.length === 0) return [];
  const values = points.map((point) => Number(point.value.amount));
  const min = Math.min(...values);
  const max = Math.max(...values);
  const spread = max - min || 1;
  return values.map((value, index) => {
    const x = points.length === 1 ? 50 : (index / (points.length - 1)) * 100;
    const y = 88 - ((value - min) / spread) * 68;
    return { x, y };
  });
}

export function PortfolioTrend({ points, title = 'Portfolio trend', caption = 'Portfolio value data' }: {
  points: TrendPointReadModel[];
  title?: string;
  caption?: string;
}) {
  const coordinates = chartCoordinates(points);
  const polyline = coordinates
    .map(({ x, y }) => `${x.toFixed(2)},${y.toFixed(2)}`)
    .join(' ');
  const first = points[0]?.value ?? null;
  const last = points.at(-1)?.value ?? null;

  return (
    <section className="trend-card" aria-labelledby="trend-title">
      <div className="card-heading-row">
        <div><p className="eyebrow">Trajectory</p><h2 id="trend-title">{title}</h2></div>
        <div className="chart-range"><FinancialValue value={formatCompactMoney(first)} /><span>to</span><FinancialValue value={formatCompactMoney(last)} /></div>
      </div>
      <div aria-label={`Portfolio value trend, ${points.length} observations`} className="trend-visual" role="img">
        <svg aria-hidden="true" preserveAspectRatio="none" viewBox="0 0 100 100">
          <defs>
            <linearGradient id="trend-area-gold" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0" stopColor="var(--gold)" stopOpacity=".32" />
              <stop offset="1" stopColor="var(--gold)" stopOpacity="0" />
            </linearGradient>
          </defs>
          <g className="svg-grid"><line x1="0" x2="100" y1="20" y2="20" /><line x1="0" x2="100" y1="43" y2="43" /><line x1="0" x2="100" y1="66" y2="66" /><line x1="0" x2="100" y1="89" y2="89" /></g>
          {polyline ? <polygon className="trend-area" points={`0,92 ${polyline} 100,92`} /> : null}
          {polyline ? <polyline className="trend-line" points={polyline} /> : null}
        </svg>
        <div className="trend-focus-points">
          {coordinates.map(({ x, y }, index) => {
            const point = points[index]!;
            const descriptionId = `trend-point-${index}`;
            return (
              <span
                aria-describedby={descriptionId}
                aria-label={`Trend point ${index + 1}: ${point.label}`}
                className="trend-focus-point"
                key={`${point.at}-${point.label}`}
                role="group"
                style={{ left: `${x}%`, top: `${y}%` }}
                tabIndex={0}
              >
                <span className="trend-point-tooltip" id={descriptionId}>
                  <span>{point.label}</span>
                  <FinancialValue as="strong" value={formatMoney(point.value)} />
                </span>
              </span>
            );
          })}
        </div>
        <div className="trend-axis" aria-hidden="true">{points.map((point) => <small key={`${point.at}-${point.label}`}>{point.label}</small>)}</div>
      </div>
      <table aria-label={caption} className="sr-only">
        <caption>{caption}</caption>
        <thead><tr><th scope="col">Period</th><th scope="col">Value</th></tr></thead>
        <tbody>{points.map((point) => <tr key={point.at}><th scope="row">{point.label}</th><td><FinancialValue value={formatMoney(point.value)} /></td></tr>)}</tbody>
      </table>
    </section>
  );
}
