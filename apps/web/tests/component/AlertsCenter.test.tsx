import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { AlertsCenter } from '../../components/alerts/AlertsCenter';
import { ScreenPrivacyProvider } from '../../lib/privacy/privacy-context';

const evidence = {
  snapshotId: 'snapshot-a',
  baselineObservationId: 'snapshot-baseline',
  sourceAsOf: '2026-08-25T11:59:00.000Z',
  observedMoney: null,
  observedRatio: { value: '0.34' },
  thresholdMoney: null,
  thresholdRatio: { value: '0.30' },
  flowAdjustment: { amount: '0', currency: 'USD' as const },
  quality: {
    freshness: 'fresh' as const,
    coverage: 'complete' as const,
    reconciliation: 'reconciled' as const,
    mixedMarketState: false,
    unsupportedWeight: { value: '0' },
  },
  calculationVersion: 'test-v1',
  scope: { type: 'portfolio' as const },
  decisionReason: 'Synthetic threshold reached.',
};

describe('AlertsCenter', () => {
  it('marks alerts read, exposes evidence, and supports local snooze controls', async () => {
    const user = userEvent.setup();
    render(<ScreenPrivacyProvider><AlertsCenter alerts={[{ id: 'alert-a', title: 'Synthetic watch', description: 'Synthetic evidence.', severity: 'watch', state: 'new', createdAt: '2026-08-25T12:00:00.000Z', mutedUntil: null, evidence }]} apiBaseUrl="" mode="demo" sourceAsOf="2026-08-25T11:59:00.000Z" /></ScreenPrivacyProvider>);
    await waitFor(() => expect(screen.getByLabelText('Portfolio alerts')).toHaveAttribute('data-aurum-ready', 'true'));
    await user.click(screen.getByRole('button', { name: 'Evidence' }));
    expect(screen.getByText('Source as of')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Mark read' }));
    expect(screen.getByText('read')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Snooze 24h' }));
    expect(screen.getByText('Snoozed')).toBeInTheDocument();
  });

  it('persists connected actions with a CSRF-protected request', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ data: { token: 'synthetic-csrf-token' } }), {
          status: 200,
        }),
      )
      .mockResolvedValueOnce(new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetcher);
    const user = userEvent.setup();
    render(<ScreenPrivacyProvider><AlertsCenter alerts={[{ id: 'alert-a', title: 'Portfolio watch', description: 'Evidence.', severity: 'watch', state: 'new', createdAt: '2026-08-25T12:00:00.000Z', mutedUntil: null, evidence: { ...evidence, decisionReason: 'Threshold reached.' } }]} apiBaseUrl="https://api.example.test" mode="connected" sourceAsOf="2026-08-25T11:59:00.000Z" /></ScreenPrivacyProvider>);

    await user.click(screen.getByRole('button', { name: 'Mark read' }));

    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
    expect(fetcher.mock.calls[1]?.[0]).toBe(
      'https://api.example.test/v1/alerts/alert-a/read',
    );
    expect(fetcher.mock.calls[1]?.[1]?.headers).toEqual(
      expect.objectContaining({ 'x-csrf-token': 'synthetic-csrf-token' }),
    );
    expect(screen.getByText('read')).toBeVisible();
    vi.unstubAllGlobals();
  });

  it('removes the Snoozed state when a mute expires while the page remains open', async () => {
    render(
      <ScreenPrivacyProvider>
        <AlertsCenter
          alerts={[{
            id: 'alert-expiring', title: 'Expiring mute', description: 'Evidence.',
            severity: 'info', state: 'read', createdAt: '2026-08-25T12:00:00.000Z',
            mutedUntil: new Date(Date.now() + 50).toISOString(), evidence,
          }]}
          apiBaseUrl=""
          mode="demo"
          sourceAsOf="2026-08-25T11:59:00.000Z"
        />
      </ScreenPrivacyProvider>,
    );

    expect(screen.getByText('Snoozed')).toBeVisible();
    await waitFor(() => expect(screen.queryByText('Snoozed')).not.toBeInTheDocument());
    expect(screen.queryByRole('button', { name: 'Unmute' })).not.toBeInTheDocument();
  });
});
