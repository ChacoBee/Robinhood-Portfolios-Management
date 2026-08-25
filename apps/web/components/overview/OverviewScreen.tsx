import type { DashboardReadModel } from '@aurum/domain';
import Link from 'next/link';
import { formatMoney, formatRatio, valueDirection } from '../../lib/formatters';
import { AllocationChart } from '../charts/AllocationChart';
import { PortfolioTrend } from '../charts/PortfolioTrend';
import { HoldingsTable } from '../tables/HoldingsTable';
import { DataQualityCard } from '../ui/DataQualityCard';
import { FinancialValue } from '../ui/FinancialValue';
import { SourceNotice } from '../ui/SourceNotice';

export function OverviewScreen({ model }: { model: DashboardReadModel }) {
  const direction = valueDirection(model.dailyChange);
  return (
    <main className="dashboard-main" id="overview">
      <SourceNotice asOf={model.asOf} mode={model.mode} quality={model.quality} />
      <section className="hero-card" aria-labelledby="portfolio-value-title">
        <div className="hero-copy">
          <div className="hero-label-row"><h1 id="portfolio-value-title">Portfolio value</h1><span className="read-only-pill">Read only</span></div>
          <FinancialValue as="p" className="hero-value" unavailable={!model.portfolioValue} value={formatMoney(model.portfolioValue)} />
          <div className={`daily-movement ${direction}`}>
            <FinancialValue unavailable={!model.dailyChange} value={formatMoney(model.dailyChange, { sign: true })} />
            <FinancialValue unavailable={!model.dailyChangeRatio} value={formatRatio(model.dailyChangeRatio, { sign: true })} />
            <small>today</small>
          </div>
          <p className="hero-context">Across {model.accounts.length} {model.mode === 'demo' ? 'synthetic ' : ''}accounts · Calculation {model.calculationVersion}</p>
        </div>
        <DataQualityCard quality={model.quality} />
      </section>

      <PortfolioTrend points={model.trend} />

      <div className="dashboard-grid">
        <section className="allocation-card" aria-labelledby="allocation-title">
          <div className="card-heading-row"><div><p className="eyebrow">Exposure</p><h2 id="allocation-title">Asset allocation</h2></div><Link className="text-button link-button" href="/analytics">Explore</Link></div>
          <AllocationChart slices={model.allocation} />
        </section>

        {model.insight ? (
          <aside className="insight-card" aria-labelledby="insight-title">
            <div aria-hidden="true" className="insight-orbit">✦</div>
            <p className="eyebrow">Aurum insight</p>
            <h2 id="insight-title">{model.insight.title}</h2>
            <p>{model.insight.body}</p>
            <Link className="secondary-button link-button" href="/analytics">View analysis</Link>
          </aside>
        ) : null}
      </div>

      <section className="holdings-card" aria-labelledby="holdings-title">
        <div className="card-heading-row"><div><p className="eyebrow">Largest positions</p><h2 id="holdings-title">Top holdings</h2></div><Link className="text-button link-button" href="/holdings">View all</Link></div>
        <HoldingsTable holdings={model.topHoldings} label="Top synthetic holdings" />
      </section>

      <footer className="demo-disclaimer">{model.mode === 'demo' ? '◇ Synthetic Demo · Invented values and securities · No live brokerage connection' : 'Read-only brokerage data · Trading is unavailable in Aurum'}</footer>
    </main>
  );
}
