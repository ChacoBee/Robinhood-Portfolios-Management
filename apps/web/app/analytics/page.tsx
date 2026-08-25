import type { Metadata } from 'next';
import Link from 'next/link';
import { AllocationChart } from '../../components/charts/AllocationChart';
import { FinancialValue } from '../../components/ui/FinancialValue';
import { PageHeader } from '../../components/ui/PageHeader';
import { SourceNotice } from '../../components/ui/SourceNotice';
import { StatCard } from '../../components/ui/StatCard';
import { getPortfolioDataSource } from '../../lib/api/data-source';
import { formatMoney, formatRatio } from '../../lib/formatters';

export const metadata: Metadata = { title: 'Analytics' };

export default async function AnalyticsPage() {
  const model = await getPortfolioDataSource().analytics();
  return (
    <main className="dashboard-main">
      <SourceNotice asOf={null} mode={model.mode} quality={model.quality} />
      <PageHeader description="Understand concentration, asset mix, and the boundaries of supported position detail." eyebrow="Portfolio diagnostics" title="Analytics" />
      <div className="stats-grid four"><StatCard label="Top-two concentration" tone="watch" value={<FinancialValue value={formatRatio(model.topTwoWeight)} unavailable={!model.topTwoWeight} />} detail="Combined portfolio weight" /><StatCard label="Supported assets" value={<FinancialValue value={formatRatio(model.supportedAssetsWeight)} unavailable={!model.supportedAssetsWeight} />} detail="Eligible for detailed analytics" /><StatCard label="Unsupported detail" tone="watch" value={<FinancialValue value={formatMoney(model.unsupportedDetailValue)} />} detail="Included in total value" /><StatCard label="Largest position" value={model.largestHolding?.symbol ?? 'Unavailable'} detail={model.largestHolding ? <FinancialValue value={formatRatio(model.largestHolding.allocation)} /> : 'No holdings'} /></div>
      <div className="content-grid">
        <section className="data-card"><div className="card-heading-row"><div><p className="eyebrow">Asset mix</p><h2>Allocation profile</h2></div></div><AllocationChart slices={model.allocation} /></section>
        <section className="insight-card analytics-insight"><div aria-hidden="true" className="insight-orbit">✦</div><p className="eyebrow">Concentration watch</p><h2>{model.largestHolding ? `${model.largestHolding.symbol} is your largest modeled exposure` : 'No modeled exposure available'}</h2><p>{model.largestHolding ? `${model.largestHolding.name} represents ${formatRatio(model.largestHolding.allocation)} of portfolio value. Review account overlap before acting.` : 'Aurum needs at least one modeled holding to calculate concentration.'}</p>{model.largestHolding ? <Link className="secondary-button link-button" href={`/holdings/${encodeURIComponent(model.largestHolding.instrumentId)}`}>Inspect holding</Link> : null}</section>
      </div>
      <section className="inline-warning"><strong>Analytical boundary</strong><p>{model.quality.reasons.join(' ') || 'No known limitations are reported.'} Aurum does not infer missing cost basis, quotes, or unsupported instrument details.</p></section>
    </main>
  );
}
