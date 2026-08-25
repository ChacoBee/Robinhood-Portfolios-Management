import type { Metadata } from 'next';
import Link from 'next/link';
import { FinancialValue } from '../../../components/ui/FinancialValue';
import { PageHeader } from '../../../components/ui/PageHeader';
import { SourceNotice } from '../../../components/ui/SourceNotice';
import { StatCard } from '../../../components/ui/StatCard';
import { getPortfolioDataSource } from '../../../lib/api/data-source';
import { formatMoney } from '../../../lib/formatters';

export const metadata: Metadata = { title: 'Reconciliation' };

export default async function ReconciliationPage() {
  const model = await getPortfolioDataSource().reconciliation();
  const reconciled = model.accounts.filter((account) => account.state === 'reconciled').length;
  return (
    <main className="dashboard-main">
      <SourceNotice asOf={model.asOf} mode={model.mode} />
      <Link className="back-link" href="/activity">← Activity</Link>
      <PageHeader description="Provider totals are compared with cash plus modeled positions. Residuals are never silently discarded." eyebrow="Balance controls" title="Reconciliation" />
      <div className="stats-grid"><StatCard label="Accounts checked" value={model.accounts.length} /><StatCard label="Reconciled" tone={reconciled === model.accounts.length ? 'positive' : 'watch'} value={`${reconciled}/${model.accounts.length}`} /><StatCard label="Tolerance" value={<FinancialValue value={formatMoney(model.accounts[0]?.tolerance ?? null)} unavailable={!model.accounts[0]} />} detail="Per account" /></div>
      <section className="data-card"><div className="card-heading-row"><div><p className="eyebrow">Proof</p><h2>Account balance checks</h2></div></div><div aria-label="Account reconciliation, horizontally scrollable" className="table-scroll" role="region" tabIndex={0}><table aria-label="Account reconciliation" className="holdings-table reconciliation-table"><thead><tr><th scope="col">Account</th><th scope="col">Provider total</th><th scope="col">Modeled total</th><th scope="col">Residual</th><th scope="col">State</th></tr></thead><tbody>{model.accounts.map((account) => <tr key={account.accountId}><th scope="row"><span className="holding-symbol">{account.displayName}</span><span className="holding-name">{account.inclusionReason}</span></th><td><FinancialValue value={formatMoney(account.providerTotal)} /></td><td><FinancialValue value={formatMoney(account.modeledTotal)} /></td><td><FinancialValue value={formatMoney(account.residual)} /></td><td><span className={`status-chip is-${account.state}`}>{account.state}</span></td></tr>)}</tbody></table></div></section>
    </main>
  );
}
