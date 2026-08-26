import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { MobileTabBar } from '../../components/app-shell/MobileTabBar';

vi.mock('next/navigation', () => ({ usePathname: () => '/performance' }));

describe('mobile navigation', () => {
  it('exposes the exact primary tabs and a native More disclosure in tab order', async () => {
    const user = userEvent.setup();
    render(<MobileTabBar />);

    const navigation = screen.getByRole('navigation', { name: 'Mobile primary' });
    expect(navigation).toHaveTextContent('Dashboard');
    expect(navigation).toHaveTextContent('Holdings');
    expect(navigation).toHaveTextContent('Activity');
    expect(navigation).toHaveTextContent('Alerts');
    const trigger = screen.getByRole('button', { name: 'More navigation' });
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(trigger).not.toHaveAttribute('aria-haspopup');

    await user.click(trigger);
    const disclosure = screen.getByLabelText('More pages');
    expect(disclosure).toBeVisible();
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(within(disclosure).getAllByRole('link').map((item) => item.textContent)).toEqual([
      'Accounts',
      'Performance',
      'Allocation',
      'Settings',
    ]);
    expect(within(disclosure).getByRole('link', { name: 'Performance' })).toHaveAttribute('aria-current', 'page');

    const firstLink = within(disclosure).getByRole('link', { name: 'Accounts' });
    expect(trigger.compareDocumentPosition(firstLink) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0);
    await user.tab();
    expect(firstLink).toHaveFocus();

    await user.keyboard('{Escape}');
    expect(screen.queryByLabelText('More pages')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });
});
