import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import Home from '../../app/page';

describe('Aurum overview', () => {
  it('shows the five-second answer with explicit synthetic provenance', () => {
    render(<Home />);

    expect(screen.getByText('Synthetic Demo')).toBeVisible();
    expect(
      screen.getByRole('heading', { name: 'Portfolio value' }),
    ).toBeVisible();
    expect(screen.getByText('$128,640.25')).toBeVisible();
    expect(screen.getByText(/updated .* ET/i)).toBeVisible();
    expect(screen.getByText('Unsupported / residual')).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Top holdings' })).toBeVisible();
  });

  it('labels the trend with a matching accessible value table', () => {
    render(<Home />);

    expect(screen.getByRole('img', { name: /portfolio value trend/i })).toBeVisible();
    expect(
      screen.getByRole('table', { name: /portfolio value data/i }),
    ).toBeInTheDocument();
  });
});
