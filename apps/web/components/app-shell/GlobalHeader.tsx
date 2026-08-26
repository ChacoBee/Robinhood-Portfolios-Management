'use client';

import type { ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { RefreshControl } from './RefreshControl';
import { ScreenPrivacyToggle } from './ScreenPrivacyToggle';
import { pageContext } from './page-context';

export function GlobalHeader({ mode, apiBaseUrl, userControl }: { mode: 'demo' | 'connected'; apiBaseUrl: string; userControl?: ReactNode }) {
  const context = pageContext(usePathname() ?? '/');

  return (
    <header className="global-header">
      <div className="header-title">
        <h1>{context.title}</h1>
        <p className="header-account-count">{context.subtitle}</p>
      </div>
      <div className="header-actions">
        <span className="source-badge">
          <span aria-hidden="true" className="source-dot" />
          {mode === 'demo' ? 'Synthetic Demo' : 'Connected mode'}
        </span>
        <ScreenPrivacyToggle />
        <RefreshControl apiBaseUrl={apiBaseUrl} mode={mode} />
        {userControl ?? <span aria-label="Aurum workspace" className="avatar-button" role="img"><span aria-hidden="true">A</span></span>}
      </div>
    </header>
  );
}
