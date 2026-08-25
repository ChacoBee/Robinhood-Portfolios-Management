import { RefreshControl } from './RefreshControl';
import { ScreenPrivacyToggle } from './ScreenPrivacyToggle';

export function GlobalHeader({ mode, apiBaseUrl }: { mode: 'demo' | 'connected'; apiBaseUrl: string }) {
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
        <span aria-label="Aurum workspace" className="avatar-button" role="img"><span aria-hidden="true">A</span></span>
      </div>
    </header>
  );
}
