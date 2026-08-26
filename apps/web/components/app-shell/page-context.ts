export type PageContext = Readonly<{ title: string; subtitle: string }>;

const dashboard: PageContext = {
  title: 'Dashboard',
  subtitle: 'Overview across all portfolios',
};

export function pageContext(pathname: string): PageContext {
  if (pathname === '/') return dashboard;
  if (/^\/accounts\/[^/]+$/.test(pathname)) return { title: 'Account details', subtitle: 'Balances, holdings, and source quality' };
  if (pathname === '/accounts') return { title: 'Accounts', subtitle: 'Connected portfolio accounts' };
  if (/^\/holdings\/[^/]+$/.test(pathname)) return { title: 'Holding details', subtitle: 'Position value, return, and provenance' };
  if (pathname === '/holdings') return { title: 'Holdings', subtitle: 'Every position currently tracked' };
  if (pathname === '/performance') return { title: 'Performance', subtitle: 'Read-only portfolio history' };
  if (pathname === '/analytics') return { title: 'Allocation', subtitle: 'Exposure, concentration, and portfolio structure' };
  if (pathname === '/activity/imports') return { title: 'Imports', subtitle: 'Preview and confirm portfolio records' };
  if (pathname === '/activity/reconciliation') return { title: 'Reconciliation', subtitle: 'Provider totals and coverage evidence' };
  if (pathname === '/activity') return { title: 'Activity', subtitle: 'Sync, import, and portfolio events' };
  if (pathname === '/alerts') return { title: 'Alerts', subtitle: 'Read-only portfolio monitoring rules' };
  if (pathname === '/settings') return { title: 'Settings', subtitle: 'Security, privacy, and data controls' };
  return dashboard;
}
