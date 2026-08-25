import type { Metadata } from 'next';
import Link from 'next/link';
import { ActivityTimeline } from '../../components/activity/ActivityTimeline';
import { PageHeader } from '../../components/ui/PageHeader';
import { SourceNotice } from '../../components/ui/SourceNotice';
import { StatCard } from '../../components/ui/StatCard';
import { getPortfolioDataSource } from '../../lib/api/data-source';

export const metadata: Metadata = { title: 'Activity' };

export default async function ActivityPage() {
  const model = await getPortfolioDataSource().activity();
  const cashEvents = model.items.filter((item) => item.kind === 'deposit' || item.kind === 'withdrawal' || item.kind === 'dividend').length;
  return (
    <main className="dashboard-main">
      <SourceNotice asOf={model.asOf} mode={model.mode} quality={model.quality} />
      <PageHeader actions={<><Link className="secondary-button link-button" href="/activity/imports">Import history</Link><Link className="secondary-button link-button" href="/activity/reconciliation">View reconciliation</Link></>} description="A transparent ledger of portfolio syncs, cash flows, trades, dividends, and imports." eyebrow="Audit trail" title="Activity" />
      <div className="stats-grid"><StatCard label="Visible events" value={model.items.length} detail="Newest first" /><StatCard label="Cash-flow events" value={cashEvents} detail="Used as performance context" /><StatCard label="Source coverage" value={model.quality.coverage.replaceAll('_', ' ')} detail={model.quality.freshness} /></div>
      <ActivityTimeline items={model.items} />
    </main>
  );
}
