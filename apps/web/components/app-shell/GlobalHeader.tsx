'use client';

import { useState } from 'react';
import { ScreenPrivacyToggle } from './ScreenPrivacyToggle';

export function GlobalHeader({ freshness }: { freshness: string }) {
  const [refreshing, setRefreshing] = useState(false);

  function refreshPreview() {
    if (refreshing) return;
    setRefreshing(true);
    window.setTimeout(() => setRefreshing(false), 900);
  }

  return (
    <header className="global-header">
      <div className="header-title">
        <p className="eyebrow">All portfolios</p>
        <p className="header-account-count">Three synthetic accounts</p>
      </div>

      <div className="header-actions">
        <div className="freshness-copy">
          <span className="demo-badge">Synthetic Demo</span>
          <small>{freshness}</small>
        </div>
        <ScreenPrivacyToggle />
        <button
          aria-label="Refresh synthetic data"
          className="icon-button"
          disabled={refreshing}
          onClick={refreshPreview}
          type="button"
        >
          <span aria-hidden="true" className={refreshing ? 'is-spinning' : ''}>
            ↻
          </span>
        </button>
        <button className="avatar-button" type="button" aria-label="Open profile menu">
          CB
        </button>
      </div>
    </header>
  );
}
