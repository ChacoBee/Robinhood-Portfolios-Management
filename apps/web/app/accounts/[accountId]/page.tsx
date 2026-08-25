import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AllocationChart } from '../../../components/charts/AllocationChart';
import { HoldingsTable } from '../../../components/tables/HoldingsTable';
import { FinancialValue } from '../../../components/ui/FinancialValue';
import { PageHeader } from '../../../components/ui/PageHeader';
import { SourceNotice } from '../../../components/ui/SourceNotice';
import { StatCard } from '../../../components/ui/StatCard';
import { getPortfolioDataSource } from '../../../lib/api/data-source';
import { formatMoney, formatRatio, valueDirection } from '../../../lib/formatters';

export const metadata: Metadata = { title: 'Account detail' };

export default async function AccountDetailPage({ params }: { params: Promise<{ accountId: string }> }) {
  const { accountId } = await params;
  const model = await getPortfolioDataSource().account(accountId);
  if (!model) notFound();
  const direction = valueDirection(model.account.dailyChange);
  return (
    <main className="dashboard-main">
      <SourceNotice asOf={model.asOf} mode={model.mode} quality={model.quality} />
      <Link className="back-link" href="/accounts">← All accounts</Link>
      <PageHeader description={`${model.account.maskedAccountNumber ?? 'Account number hidden'} · ${model.account.holdingsCount} holdings · ${model.account.status}`} eyebrow="Account detail" title={model.account.displayName} />
      <div className="stats-grid four"><StatCard label="Account value" value={<FinancialValue value={formatMoney(model.account.value)} />} /><StatCard label="Today" tone={direction} value={<FinancialValue value={formatMoney(model.account.dailyChange, { sign: true })} unavailable={!model.account.dailyChange} />} detail={<FinancialValue value={formatRatio(model.account.dailyChangeRatio, { sign: true })} unavailable={!model.account.dailyChangeRatio} />} /><StatCard label="Cash" value={<FinancialValue value={formatMoney(model.account.cash)} />} /><StatCard label="Portfolio weight" value={<FinancialValue value={formatRatio(model.account.allocation)} />} /></div>
      <div className="content-grid two-one">
        <section className="data-card"><div className="card-heading-row"><div><p className="eyebrow">Positions</p><h2>Holdings in this account</h2></div></div><HoldingsTable holdings={model.holdings} label={`${model.account.displayName} holdings`} /></section>
        <section className="data-card"><div className="card-heading-row"><div><p className="eyebrow">Exposure</p><h2>Allocation</h2></div></div><AllocationChart label={`${model.account.displayName} allocation`} slices={model.allocation} /></section>
      </div>
    </main>
  );
}
