'use client';

import type { PreviewPortfolio } from '../../lib/demo/preview-fixture';
import { useScreenPrivacy } from '../../lib/privacy/privacy-context';
import { PortfolioTrend } from './PortfolioTrend';

export function OverviewScreen({ portfolio }: { portfolio: PreviewPortfolio }) {
  const { mask } = useScreenPrivacy();

  return (
    <main className="dashboard-main" id="overview">
      <section className="hero-card" aria-labelledby="portfolio-value-title">
        <div className="hero-copy">
          <div className="hero-label-row">
            <h1 id="portfolio-value-title">Portfolio value</h1>
            <span className="read-only-pill">Read only</span>
          </div>
          <p className="hero-value">{mask(portfolio.totalValue)}</p>
          <div className="daily-movement">
            <span>{mask(portfolio.dailyValue)}</span>
            <span>{mask(portfolio.dailyPercent)}</span>
            <small>today</small>
          </div>
          <p className="hero-context">
            Across {portfolio.accounts} synthetic accounts · Fixture timestamp shown above
          </p>
        </div>

        <div className="quality-seal" aria-label="Synthetic fixture balanced">
          <span aria-hidden="true" className="quality-ring">
            100%
          </span>
          <span>
            <small>Coverage check</small>
            <strong>Fixture balanced</strong>
            <small>All demo rows accounted for</small>
          </span>
        </div>
      </section>

      <PortfolioTrend points={portfolio.trend} />

      <div className="dashboard-grid">
        <section className="allocation-card" aria-labelledby="allocation-title">
          <div className="card-heading-row">
            <div>
              <p className="eyebrow">Exposure</p>
              <h2 id="allocation-title">Asset allocation</h2>
            </div>
            <button className="text-button" type="button">
              Explore
            </button>
          </div>

          <div className="allocation-content">
            <div
              aria-label="Asset allocation across four categories"
              className="allocation-ring"
              role="img"
            >
              <span>
                <strong>{portfolio.allocation.length}</strong>
                <small>categories</small>
              </span>
            </div>

            <ul className="allocation-list">
              {portfolio.allocation.map((item) => (
                <li key={item.label}>
                  <span aria-hidden="true" className={`legend-dot ${item.tone}`} />
                  <span className="allocation-name">{item.label}</span>
                  <span className="allocation-value">
                    <strong>{mask(item.value)}</strong>
                    <small>{mask(`${item.percentage}%`)}</small>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <aside className="insight-card" aria-labelledby="insight-title">
          <div aria-hidden="true" className="insight-orbit">
            ✦
          </div>
          <p className="eyebrow">Aurum insight</p>
          <h2 id="insight-title">Concentration deserves a closer look</h2>
          <p>
            The two largest synthetic positions represent 34.7% of this demo.
            Review account overlap before making any real-world decision.
          </p>
          <button className="secondary-button" type="button">
            View analysis
          </button>
        </aside>
      </div>

      <section className="holdings-card" aria-labelledby="holdings-title">
        <div className="card-heading-row">
          <div>
            <p className="eyebrow">Largest positions</p>
            <h2 id="holdings-title">Top holdings</h2>
          </div>
          <button className="text-button" type="button">
            View all
          </button>
        </div>

        <div className="table-scroll">
          <table aria-label="Top synthetic holdings" className="holdings-table">
            <thead>
              <tr>
                <th scope="col">Holding</th>
                <th scope="col">Market value</th>
                <th scope="col">Allocation</th>
                <th scope="col">Today</th>
              </tr>
            </thead>
            <tbody>
              {portfolio.holdings.map((holding) => (
                <tr key={holding.symbol}>
                  <th scope="row">
                    <span className="holding-symbol">{holding.symbol}</span>
                    <span className="holding-name">{holding.name}</span>
                  </th>
                  <td>{mask(holding.value)}</td>
                  <td>{mask(holding.allocation)}</td>
                  <td className={holding.direction === 'up' ? 'positive' : 'negative'}>
                    {mask(holding.move)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <footer className="demo-disclaimer">
        <span aria-hidden="true">◇</span>
        Synthetic Demo · Invented values and securities · No live brokerage connection
      </footer>
    </main>
  );
}
