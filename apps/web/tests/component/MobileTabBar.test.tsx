import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { MobileTabBar } from '../../components/app-shell/MobileTabBar';

vi.mock('next/navigation', () => ({ usePathname: () => '/performance' }));

describe('mobile navigation', () => {
  it('exposes the exact primary tabs and an accessible More menu', async () => {
    const user = userEvent.setup();
    render(<MobileTabBar />);

    const navigation = screen.getByRole('navigation', { name: 'Mobile primary' });
    expect(navigation).toHaveTextContent('Overview');
    expect(navigation).toHaveTextContent('Holdings');
    expect(navigation).toHaveTextContent('Activity');
    expect(navigation).toHaveTextContent('Alerts');
    expect(screen.getByRole('button', { name: 'More navigation' })).toHaveAttribute('aria-expanded', 'false');

    await user.click(screen.getByRole('button', { name: 'More navigation' }));
    expect(screen.getByRole('menu')).toBeVisible();
    expect(screen.getAllByRole('menuitem').map((item) => item.textContent)).toEqual([
      'Accounts',
      'Performance',
      'Analytics',
      'Settings',
    ]);
    expect(screen.getByRole('menuitem', { name: 'Performance' })).toHaveAttribute('aria-current', 'page');

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'More navigation' })).toHaveFocus();
  });
});
