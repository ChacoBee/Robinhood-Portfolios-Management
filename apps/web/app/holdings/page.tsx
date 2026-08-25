import type { Metadata } from 'next';
import { HoldingsExplorer } from '../../components/holdings/HoldingsExplorer';
import { FinancialValue } from '../../components/ui/FinancialValue';
import { PageHeader } from '../../components/ui/PageHeader';
import { SourceNotice } from '../../components/ui/SourceNotice';
import { StatCard } from '../../components/ui/StatCard';
import { getPortfolioDataSource } from '../../lib/api/data-source';
import { formatMoney } from '../../lib/formatters';

export const metadata: Metadata = { title: 'Holdings' };

export default async function HoldingsPage() {
  const model = await getPortfolioDataSource().holdings();
  const staleCount = model.holdings.filter((holding) => holding.quoteStatus === 'stale').length;
  const unsupportedCount = model.holdings.filter((holding) => holding.support === 'unsupported_detail').length;
  return (
    <main className="dashboard-main">
      <SourceNotice asOf={model.asOf} mode={model.mode} quality={model.quality} />
      <PageHeader description="Search every modeled position across accounts. Quote freshness and unsupported detail stay visible." eyebrow="Portfolio inventory" title="Holdings" />
      <div className="stats-grid four"><StatCard label="Modeled positions" value={model.holdings.length} detail="Across all accounts" /><StatCard label="Holdings value" value={<FinancialValue value={formatMoney(model.totalValue)} unavailable={!model.totalValue} />} detail="Excludes cash" /><StatCard label="Stale quotes" tone={staleCount ? 'watch' : 'default'} value={staleCount} detail="Provider values remain authoritative" /><StatCard label="Unsupported detail" tone={unsupportedCount ? 'watch' : 'default'} value={unsupportedCount} detail="Still included in total value" /></div>
      <HoldingsExplorer holdings={model.holdings} />
    </main>
  );
}
