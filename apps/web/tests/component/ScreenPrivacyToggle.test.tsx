import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { ScreenPrivacyToggle } from '../../components/app-shell/ScreenPrivacyToggle';
import { FinancialValue } from '../../components/ui/FinancialValue';
import { ScreenPrivacyProvider } from '../../lib/privacy/privacy-context';

describe('Screen Privacy Mode', () => {
  it('replaces rendered financial values and persists the choice for the session', async () => {
    const user = userEvent.setup();
    render(
      <ScreenPrivacyProvider>
        <ScreenPrivacyToggle />
        <FinancialValue value="$128,640.25" />
        <h1>Portfolio value</h1>
      </ScreenPrivacyProvider>,
    );

    await user.click(screen.getByRole('button', { name: 'Hide financial values' }));

    expect(screen.queryByText('$128,640.25')).not.toBeInTheDocument();
    expect(screen.getAllByText('••••••').length).toBeGreaterThan(0);
    expect(screen.getByRole('heading', { name: 'Portfolio value' })).toBeVisible();
    expect(screen.getByRole('status')).toHaveTextContent('Financial values hidden');
    expect(window.sessionStorage.getItem('aurum.screenPrivacy')).toBe('hidden');
  });
});
