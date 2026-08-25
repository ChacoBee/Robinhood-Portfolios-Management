import type { PerformanceRange } from '@aurum/domain';
import type { Metadata } from 'next';
import { PortfolioTrend } from '../../components/charts/PortfolioTrend';
import { PerformanceRangeNav } from '../../components/performance/PerformanceRangeNav';
import { FinancialValue } from '../../components/ui/FinancialValue';
import { PageHeader } from '../../components/ui/PageHeader';
import { SourceNotice } from '../../components/ui/SourceNotice';
import { StatCard } from '../../components/ui/StatCard';
import { getPortfolioDataSource } from '../../lib/api/data-source';
import { formatDateTime, formatMoney, formatRatio, valueDirection } from '../../lib/formatters';

export const metadata: Metadata = { title: 'Performance' };
const validRanges = new Set<PerformanceRange>(['1W', '1M', '3M', 'YTD', '1Y', 'ALL']);

export default async function PerformancePage({ searchParams }: { searchParams: Promise<{ range?: string | string[] }> }) {
  const rawRange = (await searchParams).range;
  const requested = typeof rawRange === 'string' ? rawRange.toUpperCase() : '1W';
  const range: PerformanceRange = validRanges.has(requested as PerformanceRange) ? requested as PerformanceRange : '1W';
  const model = await getPortfolioDataSource().performance(range);
  const direction = valueDirection(model.change);
  return (
    <main className="dashboard-main">
      <SourceNotice asOf={model.asOf} mode={model.mode} quality={model.quality} />
      <PageHeader actions={<PerformanceRangeNav selected={range} />} description="Track portfolio value movement with external cash flows disclosed separately." eyebrow="Time series" title="Performance" />
      <div className="stats-grid four"><StatCard label="Start value" value={<FinancialValue value={formatMoney(model.startValue)} unavailable={!model.startValue} />} detail={range} /><StatCard label="End value" value={<FinancialValue value={formatMoney(model.endValue)} unavailable={!model.endValue} />} detail={model.seriesLabel.replaceAll('_', ' ')} /><StatCard label="Change" tone={direction} value={<FinancialValue value={formatMoney(model.change, { sign: true })} unavailable={!model.change} />} detail={<FinancialValue value={formatRatio(model.changeRatio, { sign: true })} unavailable={!model.changeRatio} />} /><StatCard label="External flows" value={model.externalFlows.length} detail="Shown separately, not hidden in return" /></div>
      <PortfolioTrend caption={`${range} portfolio performance values`} points={model.trend} title={`${range} value movement`} />
      <section className="data-card"><div className="card-heading-row"><div><p className="eyebrow">Cash-flow context</p><h2>External flows</h2></div></div>{model.externalFlows.length ? <ul className="simple-list">{model.externalFlows.map((flow) => <li key={`${flow.at}-${flow.label}`}><div><strong>{flow.label}</strong><small>{formatDateTime(flow.at)}</small></div><FinancialValue className={valueDirection(flow.value)} value={formatMoney(flow.value, { sign: true })} /></li>)}</ul> : <p className="muted-copy">No external flows are recorded in this range.</p>}</section>
    </main>
  );
}
