import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ImportScreen } from '../../components/activity/ImportScreen';
import { DataControls } from '../../components/settings/DataControls';

describe('interactive island readiness', () => {
  it('publishes a per-island readiness marker for destructive and import controls', async () => {
    const { rerender } = render(<DataControls apiBaseUrl="" mode="demo" />);
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Retention, export, and deletion' }).closest('section')).toHaveAttribute('data-aurum-ready', 'true'));

    rerender(<ImportScreen apiBaseUrl="" mode="demo" />);
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Preview before importing' }).closest('section')).toHaveAttribute('data-aurum-ready', 'true'));
  });
});
