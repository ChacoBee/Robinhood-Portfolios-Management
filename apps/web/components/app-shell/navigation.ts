import type { NavigationIconName } from './NavigationIcon';

export const primaryNavigation = [
  { label: 'Dashboard', href: '/', icon: 'dashboard' },
  { label: 'Accounts', href: '/accounts', icon: 'accounts' },
  { label: 'Holdings', href: '/holdings', icon: 'holdings' },
  { label: 'Performance', href: '/performance', icon: 'performance' },
  { label: 'Allocation', href: '/analytics', icon: 'allocation' },
  { label: 'Activity', href: '/activity', icon: 'activity' },
  { label: 'Alerts', href: '/alerts', icon: 'alerts' },
  { label: 'Settings', href: '/settings', icon: 'settings' },
] as const satisfies readonly {
  label: string;
  href: string;
  icon: NavigationIconName;
}[];

export function pathIsActive(pathname: string, href: string) {
  return href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`);
}
