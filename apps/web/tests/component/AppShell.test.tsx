import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DashboardShell } from '../../components/app-shell/DashboardShell';

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
});
