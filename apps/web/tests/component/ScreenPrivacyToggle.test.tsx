import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import Home from '../../app/page';

describe('Screen Privacy Mode', () => {
  it('replaces rendered financial values while preserving their labels', async () => {
    const user = userEvent.setup();
    render(<Home />);

    await user.click(
      screen.getByRole('button', { name: 'Hide financial values' }),
    );

    expect(screen.queryByText('$128,640.25')).not.toBeInTheDocument();
    expect(screen.getAllByText('••••••').length).toBeGreaterThan(0);
    expect(
      screen.getByRole('heading', { name: 'Portfolio value' }),
    ).toBeVisible();
    expect(screen.getByRole('status')).toHaveTextContent(
      'Financial values hidden',
    );
  });
});
