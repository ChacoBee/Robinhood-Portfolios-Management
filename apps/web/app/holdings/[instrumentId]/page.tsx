import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { FinancialValue } from '../../../components/ui/FinancialValue';
import { PageHeader } from '../../../components/ui/PageHeader';
import { SourceNotice } from '../../../components/ui/SourceNotice';
import { StatCard } from '../../../components/ui/StatCard';
import { getPortfolioDataSource } from '../../../lib/api/data-source';
import { formatMoney, formatQuantity, formatRatio, valueDirection } from '../../../lib/formatters';

export const metadata: Metadata = { title: 'Holding detail' };

export default async function HoldingDetailPage({ params }: { params: Promise<{ instrumentId: string }> }) {
  const { instrumentId } = await params;
  const model = await getPortfolioDataSource().holding(instrumentId);
  if (!model) notFound();
  const holding = model.holding;
  const dailyDirection = valueDirection(holding.dailyChange);
  const pnlDirection = valueDirection(holding.unrealizedPnl);
  return (
    <main className="dashboard-main">
      <SourceNotice asOf={model.asOf} mode={model.mode} quality={model.quality} />
      <Link className="back-link" href="/holdings">← All holdings</Link>
      <PageHeader actions={<span className={`status-chip is-${holding.quoteStatus}`}>Quote {holding.quoteStatus}</span>} description={`${holding.name} · ${holding.assetClass} · ${formatQuantity(holding.quantity)} units`} eyebrow="Holding detail" title={holding.symbol} />
      {holding.support === 'unsupported_detail' ? <section className="inline-warning"><strong>Limited instrument detail</strong><p>This position contributes to portfolio value and reconciliation, but quote and cost-basis analytics are not supported by the current source.</p></section> : null}
      <div className="stats-grid four"><StatCard label="Market value" value={<FinancialValue value={formatMoney(holding.marketValue)} />} /><StatCard label="Portfolio weight" value={<FinancialValue value={formatRatio(holding.allocation)} />} /><StatCard label="Today" tone={dailyDirection} value={<FinancialValue value={formatMoney(holding.dailyChange, { sign: true })} unavailable={!holding.dailyChange} />} detail={<FinancialValue value={formatRatio(holding.dailyChangeRatio, { sign: true })} unavailable={!holding.dailyChangeRatio} />} /><StatCard label="Unrealized P&L" tone={pnlDirection} value={<FinancialValue value={formatMoney(holding.unrealizedPnl, { sign: true })} unavailable={!holding.unrealizedPnl} />} detail={<FinancialValue value={formatRatio(holding.unrealizedPnlRatio, { sign: true })} unavailable={!holding.unrealizedPnlRatio} />} /></div>
      <div className="content-grid">
        <section className="data-card"><div className="card-heading-row"><div><p className="eyebrow">Account map</p><h2>Held across accounts</h2></div></div><ul className="account-distribution">{holding.accounts.map((account) => <li key={account.accountId}><div><Link href={`/accounts/${encodeURIComponent(account.accountId)}`}>{account.displayName}</Link><small>{formatRatio(account.allocation)} of this holding</small></div><FinancialValue value={formatMoney(account.value)} /></li>)}</ul></section>
        <section className="data-card detail-list-card"><div className="card-heading-row"><div><p className="eyebrow">Cost context</p><h2>Position details</h2></div></div><dl className="detail-list"><div><dt>Quantity</dt><dd>{formatQuantity(holding.quantity)}</dd></div><div><dt>Cost basis</dt><dd><FinancialValue value={formatMoney(holding.costBasis)} unavailable={!holding.costBasis} /></dd></div><div><dt>Support</dt><dd>{holding.support.replace('_', ' ')}</dd></div><div><dt>Quote status</dt><dd>{holding.quoteStatus}</dd></div></dl></section>
      </div>
    </main>
  );
}
