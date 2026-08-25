import type { Metadata } from 'next';
import { ImportScreen } from '../../../components/activity/ImportScreen';
import { PageHeader } from '../../../components/ui/PageHeader';
import { configuredDataMode } from '../../../lib/api/data-source';

export const metadata: Metadata = { title: 'Import activity' };

export default function ImportActivityPage() {
  const mode = configuredDataMode();
  return (
    <main className="dashboard-main">
      <PageHeader
        description="Validate source rows, conflicts, and errors before any portfolio history is recorded."
        eyebrow="Activity & imports"
        title="Import history"
      />
      <div className="inline-warning">
        <strong>{mode === 'demo' ? 'Synthetic fixture only' : 'Review is required'}</strong>
        <p>{mode === 'demo' ? 'The public Demo does not upload private files.' : 'Nothing is saved until you confirm selected rows.'}</p>
      </div>
      <ImportScreen apiBaseUrl={mode === 'connected' ? '/api/aurum' : ''} mode={mode} />
    </main>
  );
}
