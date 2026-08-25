import type { Metadata } from 'next';
import Link from 'next/link';
import { FinancialValue } from '../../components/ui/FinancialValue';
import { PageHeader } from '../../components/ui/PageHeader';
import { SourceNotice } from '../../components/ui/SourceNotice';
import { StatCard } from '../../components/ui/StatCard';
import { getPortfolioDataSource } from '../../lib/api/data-source';
import { formatMoney, formatRatio, valueDirection } from '../../lib/formatters';

export const metadata: Metadata = { title: 'Accounts' };

export default async function AccountsPage() {
  const model = await getPortfolioDataSource().accounts();
  return (
    <main className="dashboard-main">
      <SourceNotice asOf={model.asOf} mode={model.mode} quality={model.quality} />
      <PageHeader description="Every account in one read-only view, with cash, value, and daily movement kept distinct." eyebrow="Portfolio structure" title="Accounts" />
      <div className="stats-grid"><StatCard label="Combined value" value={<FinancialValue value={formatMoney(model.portfolioValue)} unavailable={!model.portfolioValue} />} detail={`${model.accounts.length} active accounts`} /><StatCard label="Reconciliation" value={model.quality.reconciliation} detail={model.quality.coverage.replaceAll('_', ' ')} /></div>
      <section aria-labelledby="account-list-title" className="account-grid-section">
        <div className="section-heading"><div><p className="eyebrow">Ownership</p><h2 id="account-list-title">Account breakdown</h2></div></div>
        <div className="account-grid">{model.accounts.map((account) => {
          const direction = valueDirection(account.dailyChange);
          return <Link className="account-card" href={`/accounts/${encodeURIComponent(account.id)}`} key={account.id}>
            <div className="account-card-top"><span className="account-monogram" aria-hidden="true">{account.displayName.slice(0, 1)}</span><span className={`status-chip is-${account.status}`}>{account.status}</span></div>
            <div><h3>{account.displayName}</h3><p>{account.maskedAccountNumber ?? 'Account number hidden'}</p></div>
            <FinancialValue as="strong" className="account-value" value={formatMoney(account.value)} />
            <div className="account-card-metrics"><span><small>Today</small><FinancialValue className={direction} value={formatRatio(account.dailyChangeRatio, { sign: true })} unavailable={!account.dailyChangeRatio} /></span><span><small>Cash</small><FinancialValue value={formatMoney(account.cash)} /></span><span><small>Portfolio</small><FinancialValue value={formatRatio(account.allocation)} /></span></div>
          </Link>;
        })}</div>
      </section>
    </main>
  );
}
