'use client';

import { useState } from 'react';
import { csrfMutation } from '../../lib/api/csrf-mutation';

type RefreshState = 'idle' | 'queued' | 'coalesced' | 'error';

export function RefreshControl({ mode, apiBaseUrl }: { mode: 'demo' | 'connected'; apiBaseUrl: string }) {
  const [state, setState] = useState<RefreshState>('idle');
  const busy = state === 'queued';

  async function requestRefresh() {
    if (mode === 'demo' || busy) return;
    setState('queued');
    try {
      const response = await csrfMutation(apiBaseUrl, '/v1/refresh', {
        method: 'POST',
        headers: { accept: 'application/json' },
      });
      if (!response.ok) throw new Error('refresh_failed');
      const payload = (await response.json()) as { data?: { state?: RefreshState } };
      setState(payload.data?.state === 'coalesced' ? 'coalesced' : 'queued');
    } catch {
      setState('error');
    }
  }

  const label = mode === 'demo'
    ? 'Refresh unavailable in Synthetic Demo'
    : busy
      ? 'Refresh queued'
      : 'Request portfolio refresh';

  return (
    <>
      <button
        aria-label={label}
        className="icon-button"
        disabled={mode === 'demo' || busy}
        onClick={requestRefresh}
        title={label}
        type="button"
      >
        <svg aria-hidden="true" className={busy ? 'is-spinning' : ''} viewBox="0 0 24 24">
          <path d="M20 7v5h-5M4 17v-5h5M18.2 9A7 7 0 0 0 6.8 6.2L4 9m16 6-2.8 2.8A7 7 0 0 1 5.8 15" />
        </svg>
      </button>
      <span aria-live="polite" className="sr-only">{state === 'error' ? 'Refresh request failed' : state === 'coalesced' ? 'Refresh already queued' : busy ? 'Refresh queued' : ''}</span>
    </>
  );
}
