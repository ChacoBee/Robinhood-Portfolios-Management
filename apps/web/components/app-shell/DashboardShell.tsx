'use client';

import { useEffect, type ReactNode } from 'react';
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
  useEffect(() => {
    // Vinext can hydrate nested client islands immediately after the shell.
    // Keep SSR buttons inert for two frames so a visible control can never be
    // clicked before its event handler is attached.
    let secondFrame = 0;
    const firstFrame = window.requestAnimationFrame(() => {
      secondFrame = window.requestAnimationFrame(() => {
        document.body.dataset.aurumHydrated = 'true';
      });
    });
    return () => {
      window.cancelAnimationFrame(firstFrame);
      if (secondFrame) window.cancelAnimationFrame(secondFrame);
    };
  }, []);

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
