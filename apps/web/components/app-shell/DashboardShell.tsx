'use client';

import { type ReactNode } from 'react';
import { ScreenPrivacyProvider } from '../../lib/privacy/privacy-context';
import { DesktopSideRail } from './DesktopSideRail';
import { GlobalHeader } from './GlobalHeader';
import { MobileTabBar } from './MobileTabBar';
import { SourceStatusProvider } from './source-status-context';

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
      <SourceStatusProvider>
        <div className="app-shell" data-shell-mode={mode}>
          <DesktopSideRail mode={mode} />
          <div className="app-frame">
            <GlobalHeader apiBaseUrl={apiBaseUrl} mode={mode} userControl={userControl} />
            {children}
          </div>
          <MobileTabBar />
        </div>
      </SourceStatusProvider>
    </ScreenPrivacyProvider>
  );
}
