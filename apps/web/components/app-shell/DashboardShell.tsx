'use client';

import { type ReactNode } from 'react';
import { ScreenPrivacyProvider } from '../../lib/privacy/privacy-context';
import { DesktopSideRail } from './DesktopSideRail';
import { GlobalHeader } from './GlobalHeader';
import { MobileTabBar } from './MobileTabBar';

export function DashboardShell({
  children,
  mode,
  apiBaseUrl,
  userControl,
}: {
  children: ReactNode;
  mode: 'demo' | 'connected';
  apiBaseUrl: string;
  userControl?: ReactNode;
}) {
  return (
    <ScreenPrivacyProvider>
      <div className="app-shell">
        <DesktopSideRail mode={mode} />
        <div className="app-frame">
          <GlobalHeader apiBaseUrl={apiBaseUrl} mode={mode} userControl={userControl} />
          {children}
        </div>
        <MobileTabBar />
      </div>
    </ScreenPrivacyProvider>
  );
}
