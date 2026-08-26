'use client';

import type { ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { formatDateTime } from '../../lib/formatters';
import { RefreshControl } from './RefreshControl';
import { ScreenPrivacyToggle } from './ScreenPrivacyToggle';
import { pageContext } from './page-context';
import { useObservedSourceStatus } from './source-status-context';

export function GlobalHeader({ mode, apiBaseUrl, userControl }: { mode: 'demo' | 'connected'; apiBaseUrl: string; userControl?: ReactNode }) {
  const context = pageContext(usePathname() ?? '/');
  const sourceStatus = useObservedSourceStatus();
  const sourceLabel = sourceStatus
    ? sourceStatus.mode === 'demo'
      ? 'Synthetic Demo'
      : sourceStatus.mode === 'connected'
        ? 'Private source'
        : 'Disconnected'
    : 'Source unavailable';
  const freshnessLabel = sourceStatus
    ? `${sourceStatus.quality ? `${sourceStatus.quality.freshness} · ` : 'As of · '}${formatDateTime(sourceStatus.asOf)}`
    : 'Freshness unavailable';

  return (
    <header className="global-header">
      <div className="header-title">
        <h1>{context.title}</h1>
        <p className="header-account-count">{context.subtitle}</p>
      </div>
      <div className="header-actions">
        <div
          aria-atomic="true"
          aria-label="Shell data source status"
          className={`header-source-status is-${sourceStatus?.mode ?? 'unavailable'}`}
          role="status"
        >
          <span className="header-source-mode">
            <span aria-hidden="true" className="source-dot" />
            {sourceLabel}
          </span>
          <small className="header-source-freshness">{freshnessLabel}</small>
        </div>
        <ScreenPrivacyToggle />
        <RefreshControl apiBaseUrl={apiBaseUrl} mode={mode} />
        {userControl ?? <span aria-label="Aurum workspace" className="avatar-button" role="img"><span aria-hidden="true">A</span></span>}
      </div>
    </header>
  );
}
