import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { OverviewScreen } from '../../components/overview/OverviewScreen';
import { demoDashboard } from '../../lib/demo/dashboard-fixture';
import { ScreenPrivacyProvider } from '../../lib/privacy/privacy-context';

function renderOverview() {
  render(
    <ScreenPrivacyProvider>
      <OverviewScreen model={demoDashboard} />
    </ScreenPrivacyProvider>,
  );
}

describe('Aurum overview', () => {
  it('shows the five-second answer with explicit synthetic provenance', () => {
    renderOverview();

    expect(screen.getByText('Synthetic Demo')).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Portfolio value' })).toBeVisible();
    expect(screen.getAllByText('$128,640.25')[0]).toBeVisible();
    expect(screen.getByText(/Aug 25, 2026.*10:14 AM ET/i)).toBeVisible();
    expect(screen.getByText('Unsupported detail')).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Top holdings' })).toBeVisible();
  });

  it('labels the trend with a matching accessible value table', () => {
    renderOverview();

    expect(screen.getByRole('img', { name: /portfolio value trend/i })).toBeVisible();
    expect(screen.getByRole('table', { name: /portfolio value data/i })).toBeInTheDocument();
    const points = screen.getAllByRole('group', { name: /trend point/i });
    expect(points).toHaveLength(demoDashboard.trend.length);
    expect(points.every((point) => point.getAttribute('tabindex') === '0')).toBe(true);
  });
});
