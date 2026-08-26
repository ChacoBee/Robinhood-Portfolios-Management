import type { ReactNode } from 'react';
import { RefreshControl } from './RefreshControl';
import { ScreenPrivacyToggle } from './ScreenPrivacyToggle';

export function GlobalHeader({ mode, apiBaseUrl, userControl }: { mode: 'demo' | 'connected'; apiBaseUrl: string; userControl?: ReactNode }) {
  return (
    <header className="global-header">
      <div className="header-title">
        <p className="eyebrow">All portfolios</p>
        <p className="header-account-count">Read-only portfolio workspace</p>
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
