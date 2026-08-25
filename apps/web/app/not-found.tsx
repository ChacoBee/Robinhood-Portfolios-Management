import { EmptyState } from '../components/ui/EmptyState';

export default function NotFound() {
  return <main className="dashboard-main"><EmptyState action="Return to overview" description="This portfolio resource does not exist or is no longer available." href="/" title="Nothing found here" /></main>;
}
