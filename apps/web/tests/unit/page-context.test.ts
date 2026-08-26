import { describe, expect, it } from 'vitest';
import { pageContext } from '../../components/app-shell/page-context';

describe('page context', () => {
  it.each([
    ['/', { title: 'Dashboard', subtitle: 'Overview across all portfolios' }],
    ['/accounts', { title: 'Accounts', subtitle: 'Connected portfolio accounts' }],
    ['/accounts/account-1', { title: 'Account details', subtitle: 'Balances, holdings, and source quality' }],
    ['/holdings', { title: 'Holdings', subtitle: 'Every position currently tracked' }],
    ['/holdings/instrument-1', { title: 'Holding details', subtitle: 'Position value, return, and provenance' }],
    ['/performance', { title: 'Performance', subtitle: 'Read-only portfolio history' }],
    ['/analytics', { title: 'Allocation', subtitle: 'Exposure, concentration, and portfolio structure' }],
    ['/activity/imports', { title: 'Imports', subtitle: 'Preview and confirm portfolio records' }],
    ['/activity/reconciliation', { title: 'Reconciliation', subtitle: 'Provider totals and coverage evidence' }],
    ['/activity', { title: 'Activity', subtitle: 'Sync, import, and portfolio events' }],
    ['/alerts', { title: 'Alerts', subtitle: 'Read-only portfolio monitoring rules' }],
    ['/settings', { title: 'Settings', subtitle: 'Security, privacy, and data controls' }],
  ])('maps %s to its visible context', (pathname, expected) => {
    expect(pageContext(pathname)).toEqual(expected);
  });

  it('fails safely to the dashboard context for an unknown route', () => {
    expect(pageContext('/unknown')).toEqual({
      title: 'Dashboard',
      subtitle: 'Overview across all portfolios',
    });
  });
});
