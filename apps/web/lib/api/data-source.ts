import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { createConnectedPortfolioDataSource } from './connected-data-source';
import { createDemoPortfolioDataSource } from './demo-data-source';
import type { PortfolioDataSource } from './data-source-types';

export { ConnectedDataSourceError, createConnectedPortfolioDataSource } from './connected-data-source';
export { createDemoPortfolioDataSource } from './demo-data-source';
export type { PortfolioDataSource } from './data-source-types';

export function configuredDataMode(): 'demo' | 'connected' {
  return process.env.AURUM_DATA_MODE === 'connected' ? 'connected' : 'demo';
}

export function getPortfolioDataSource(): PortfolioDataSource {
  if (configuredDataMode() === 'connected') {
    return createConnectedPortfolioDataSource({
      baseUrl: process.env.AURUM_API_URL ?? '',
      requestHeaders: async () => {
        const incoming = await headers();
        const authorization = incoming.get('authorization');
        const cookie = incoming.get('cookie');
        return {
          ...(authorization ? { authorization } : {}),
          ...(cookie ? { cookie } : {}),
        };
      },
      onUnauthorized: () => redirect('/sign-in'),
    });
  }
  return createDemoPortfolioDataSource();
}
