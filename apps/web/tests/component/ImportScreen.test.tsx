import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { ScreenPrivacyProvider } from '../../lib/privacy/privacy-context';
import { ImportScreen } from '../../components/activity/ImportScreen';

describe('ImportScreen', () => {
  it('previews and confirms only a local synthetic fixture in Demo mode', async () => {
    const user = userEvent.setup();
    render(<ScreenPrivacyProvider><ImportScreen apiBaseUrl="" mode="demo" /></ScreenPrivacyProvider>);
    await user.click(screen.getByRole('button', { name: 'Load synthetic fixture' }));
    expect(screen.getByRole('region', { name: 'Import preview rows' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Confirm 2 selected' })).toBeEnabled();
    await user.click(screen.getByRole('button', { name: 'Confirm 2 selected' }));
    expect(screen.getByRole('status')).toHaveTextContent('Import complete');
  });
});
