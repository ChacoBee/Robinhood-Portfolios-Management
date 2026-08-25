import type { Metadata } from 'next';
import { AlertsCenter } from '../../components/alerts/AlertsCenter';
import { AlertRuleForm } from '../../components/alerts/AlertRuleForm';
import { DeliveryChannelStatus } from '../../components/alerts/DeliveryChannelStatus';
import { PageHeader } from '../../components/ui/PageHeader';
import { SourceNotice } from '../../components/ui/SourceNotice';
import { StatCard } from '../../components/ui/StatCard';
import { getPortfolioDataSource } from '../../lib/api/data-source';

export const metadata: Metadata = { title: 'Alerts' };

export default async function AlertsPage() {
  const model = await getPortfolioDataSource().alerts();
  const newCount = model.alerts.filter((alert) => alert.state === 'new').length;
  const importantCount = model.alerts.filter((alert) => alert.severity === 'important').length;
  return (
    <main className="dashboard-main">
      <SourceNotice asOf={model.asOf} mode={model.mode} />
      <PageHeader description="Attention signals for concentration, freshness, and portfolio data quality—not trading recommendations." eyebrow="Monitoring" title="Alerts" />
      <div className="stats-grid"><StatCard label="New alerts" tone={newCount ? 'watch' : 'default'} value={newCount} detail={`${model.alerts.length} total`} /><StatCard label="Important" tone={importantCount ? 'negative' : 'default'} value={importantCount} detail="Needs prompt review" /><StatCard label="Rules" value={model.rulesEnabled ? 'Enabled' : 'Disabled'} detail={model.mode === 'demo' ? 'Synthetic preview rules' : 'Portfolio monitoring'} /></div>
      <AlertsCenter alerts={model.alerts} apiBaseUrl={model.mode === 'connected' ? '/api/aurum' : ''} mode={model.mode === 'connected' ? 'connected' : 'demo'} sourceAsOf={model.asOf} />
      <div className="content-grid alert-management-grid">
        <AlertRuleForm apiBaseUrl={model.mode === 'connected' ? '/api/aurum' : ''} mode={model.mode === 'connected' ? 'connected' : 'demo'} />
        <DeliveryChannelStatus mode={model.mode === 'connected' ? 'connected' : 'demo'} />
      </div>
      <section className="inline-note"><strong>Alerts are informational</strong><p>They surface portfolio conditions and source quality. Aurum does not place orders or provide investment advice.</p></section>
    </main>
  );
}
