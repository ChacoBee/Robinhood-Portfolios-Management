import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DesktopSideRail } from '../../components/app-shell/DesktopSideRail';
import { GlobalHeader } from '../../components/app-shell/GlobalHeader';
import { ScreenPrivacyProvider } from '../../lib/privacy/privacy-context';

vi.mock('next/navigation', () => ({ usePathname: () => '/' }));

describe('connected-mode truth boundary', () => {
  it('does not claim a verified live brokerage from configuration alone', () => {
    const { container } = render(
      <ScreenPrivacyProvider>
        <DesktopSideRail mode="connected" />
        <GlobalHeader apiBaseUrl="https://api.example.test" mode="connected" />
      </ScreenPrivacyProvider>,
    );

    expect(screen.getAllByText('Connected mode')).not.toHaveLength(0);
    expect(screen.getByText('Verification required')).toBeVisible();
    expect(screen.queryByText('Connected workspace')).not.toBeInTheDocument();
    expect(screen.queryByText('Read-only brokerage data')).not.toBeInTheDocument();
    expect(container.querySelector('.source-badge.is-connected')).toBeNull();
  });
});
