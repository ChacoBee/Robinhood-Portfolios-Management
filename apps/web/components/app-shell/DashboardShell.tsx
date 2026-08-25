'use client';

import type { PreviewPortfolio } from '../../lib/demo/preview-fixture';
import { ScreenPrivacyProvider } from '../../lib/privacy/privacy-context';
import { OverviewScreen } from '../overview/OverviewScreen';
import { DesktopSideRail } from './DesktopSideRail';
import { GlobalHeader } from './GlobalHeader';
import { MobileTabBar } from './MobileTabBar';

export function DashboardShell({ portfolio }: { portfolio: PreviewPortfolio }) {
  return (
    <ScreenPrivacyProvider>
      <div className="app-shell">
        <DesktopSideRail />
        <div className="app-frame">
          <GlobalHeader freshness={portfolio.asOf} />
          <OverviewScreen portfolio={portfolio} />
        </div>
        <MobileTabBar />
      </div>
    </ScreenPrivacyProvider>
  );
}
