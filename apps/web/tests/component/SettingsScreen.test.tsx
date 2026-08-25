import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SettingsScreen } from '../../components/settings/SettingsScreen';
import { ScreenPrivacyProvider } from '../../lib/privacy/privacy-context';

describe('SettingsScreen', () => {
  afterEach(() => vi.unstubAllGlobals());
  it('shows fail-closed connected gates and requires exact deletion confirmation', async () => {
    const user = userEvent.setup();
    render(<ScreenPrivacyProvider><SettingsScreen mode="demo" /></ScreenPrivacyProvider>);
    expect(screen.getByText('No brokerage connected')).toBeInTheDocument();
    expect(screen.getByText('Security gate')).toBeInTheDocument();
    const deletion = screen.getByRole('button', { name: 'Preview deletion' });
    expect(deletion).toBeDisabled();
    await user.type(screen.getByLabelText('Type DELETE SYNTHETIC DEMO'), 'DELETE SYNTHETIC DEMO');
    expect(deletion).toBeEnabled();
  });

  it('loads the server-issued connected deletion phrase and capabilities', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/v1/export/preview')) {
        return Response.json({ data: { state: 'available' } });
      }
      if (url.endsWith('/v1/delete/preview')) {
        return Response.json({
          data: {
            state: 'available',
            confirmationPhrase: 'DELETE ALL AURUM DATA',
          },
        });
      }
      return Response.json({}, { status: 404 });
    }));
    render(<ScreenPrivacyProvider><SettingsScreen mode="connected" /></ScreenPrivacyProvider>);

    await waitFor(() =>
      expect(
        screen.getByLabelText('Type DELETE ALL AURUM DATA'),
      ).toBeEnabled(),
    );
    expect(
      screen.getByRole('button', { name: 'Export portfolio data' }),
    ).toBeEnabled();
    expect(
      screen.getByRole('button', { name: 'Schedule deletion' }),
    ).toBeDisabled();
  });
});
