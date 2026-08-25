'use client';

import type { TrendPoint } from '../../lib/demo/preview-fixture';
import { useScreenPrivacy } from '../../lib/privacy/privacy-context';

export function PortfolioTrend({ points }: { points: TrendPoint[] }) {
  const { mask } = useScreenPrivacy();

  return (
    <section className="trend-card" aria-labelledby="trend-title">
      <div className="card-heading-row">
        <div>
          <p className="eyebrow">Trajectory</p>
          <h2 id="trend-title">Portfolio trend</h2>
        </div>
        <div aria-label="Trend period" className="range-selector">
          {['1W', '1M', 'YTD', 'All'].map((period, index) => (
            <button
              aria-pressed={index === 0}
              className={index === 0 ? 'is-active' : ''}
              key={period}
              type="button"
            >
              {period}
            </button>
          ))}
        </div>
      </div>

      <div
        aria-label="Portfolio value trend, rising over seven days"
        className="trend-visual"
        role="img"
      >
        <div className="chart-grid" aria-hidden="true">
          <span />
          <span />
          <span />
          <span />
        </div>
        <div className="trend-bars" aria-hidden="true">
          {points.map((point) => (
            <div className="bar-column" key={point.label}>
              <span className="trend-bar" style={{ height: `${point.height}%` }} />
              <small>{point.label}</small>
            </div>
          ))}
        </div>
      </div>

      <table aria-label="Portfolio value data" className="sr-only">
        <caption>Seven-day synthetic portfolio value trend</caption>
        <thead>
          <tr>
            <th scope="col">Day</th>
            <th scope="col">Value</th>
          </tr>
        </thead>
        <tbody>
          {points.map((point) => (
            <tr key={point.label}>
              <th scope="row">{point.label}</th>
              <td>{mask(point.value.replace('$', 'USD '))}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
