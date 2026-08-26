import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DashboardShell } from '../../components/app-shell/DashboardShell';
import { SourceNotice } from '../../components/ui/SourceNotice';

vi.mock('next/navigation', () => ({ usePathname: () => '/' }));

describe('Aurum application shell', () => {
  it('keeps Aurum branding and exposes the compact finance navigation', () => {
    const { container } = render(
      <DashboardShell apiBaseUrl="" mode="demo"><p>Content</p></DashboardShell>,
    );

    expect(screen.getByText('Aurum')).toBeVisible();
    expect(screen.getByText('Portfolio intelligence')).toBeVisible();
    const desktopNavigation = within(screen.getByRole('complementary', { name: 'Primary' }));
    expect(desktopNavigation.getByRole('link', { name: /Dashboard/ })).toHaveAttribute('href', '/');
    expect(desktopNavigation.getByRole('link', { name: /Allocation/ })).toHaveAttribute('href', '/analytics');
    expect(screen.getByText('Read-only \u00b7 No trading access')).toBeVisible();
    expect(screen.queryByText('Obsidian Ledger')).not.toBeInTheDocument();
    expect(container.querySelector('.app-shell')).toHaveAttribute('data-shell-mode', 'demo');
    expect(container.querySelectorAll('.side-rail .nav-icon')).toHaveLength(8);
  });

  it('publishes the route source model as the persistent demo freshness status', () => {
    render(
      <DashboardShell apiBaseUrl="" mode="demo">
        <SourceNotice
          asOf="2026-08-25T14:14:00.000Z"
          mode="demo"
          quality={{
            coverage: 'partial_known_unsupported',
            freshness: 'fresh',
            reconciliation: 'reconciled',
            reasons: ['Synthetic fixture.'],
          }}
        />
      </DashboardShell>,
    );

    const shellStatus = screen.getByRole('status', { name: 'Shell data source status' });
    expect(shellStatus).toHaveTextContent('Synthetic Demo');
    expect(shellStatus).toHaveTextContent('fresh');
    expect(shellStatus).toHaveTextContent('Aug 25, 2026, 10:14 AM ET');
    expect(screen.getByRole('region', { name: 'Data source and quality' })).toBeVisible();
  });

  it('uses an observed disconnected model instead of claiming configured connected freshness', () => {
    render(
      <DashboardShell apiBaseUrl="https://api.example.test" mode="connected">
        <SourceNotice
          asOf="2026-08-25T13:00:00.000Z"
          mode="disconnected"
          quality={{
            coverage: 'partial_known_unsupported',
            freshness: 'stale',
            reconciliation: 'partial',
            reasons: ['The current source is unavailable.'],
          }}
        />
      </DashboardShell>,
    );

    const shellStatus = screen.getByRole('status', { name: 'Shell data source status' });
    expect(shellStatus).toHaveTextContent('Disconnected');
    expect(shellStatus).toHaveTextContent('stale');
    expect(shellStatus).toHaveTextContent('Aug 25, 2026, 9:00 AM ET');
  });

  it('states that source and freshness are unavailable when the route has no source model', () => {
    render(
      <DashboardShell apiBaseUrl="https://api.example.test" mode="connected">
        <p>Route without a source read model</p>
      </DashboardShell>,
    );

    const shellStatus = screen.getByRole('status', { name: 'Shell data source status' });
    expect(shellStatus).toHaveTextContent('Source unavailable');
    expect(shellStatus).toHaveTextContent('Freshness unavailable');
  });
});
