import type { Metadata } from 'next';
import { OverviewScreen } from '../components/overview/OverviewScreen';
import { getPortfolioDataSource } from '../lib/api/data-source';

export const metadata: Metadata = { title: 'Overview' };

export default async function Home() {
  const model = await getPortfolioDataSource().dashboard();
  return <OverviewScreen model={model} />;
}
