import { DashboardShell } from '../components/app-shell/DashboardShell';
import { previewPortfolio } from '../lib/demo/preview-fixture';

export default function Home() {
  return <DashboardShell portfolio={previewPortfolio} />;
}
