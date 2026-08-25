import type { Money } from './money';
import type { Provenance } from './provenance';

export type AccountTotalKind =
  | 'provider_portfolio_value'
  | 'net_liquidation_value'
  | 'account_equity'
  | 'unknown';

export type AccountStatus = 'active' | 'closed';

export interface PortfolioAccount {
  id: string;
  provider: 'robinhood' | 'imported' | 'synthetic';
  displayName: string;
  maskedAccountNumber: string | null;
  status: AccountStatus;
  totalKind: AccountTotalKind;
  providerTotal: Money | null;
  includedInCurrentSnapshot: boolean;
  provenance: Provenance;
}
