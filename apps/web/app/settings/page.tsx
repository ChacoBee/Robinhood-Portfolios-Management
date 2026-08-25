import type { Metadata } from 'next';
import { SettingsScreen } from '../../components/settings/SettingsScreen';
import { PageHeader } from '../../components/ui/PageHeader';
import { configuredDataMode } from '../../lib/api/data-source';

export const metadata: Metadata = { title: 'Settings' };

export default function SettingsPage() {
  const mode = configuredDataMode();
  return (
    <main className="dashboard-main">
      <PageHeader description="Review display privacy, source state, and the read-only guarantees behind this workspace." eyebrow="Workspace" title="Settings" />
      <SettingsScreen mode={mode} />
    </main>
  );
}
