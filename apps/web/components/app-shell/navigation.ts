export const primaryNavigation = [
  { label: 'Overview', href: '/', glyph: 'OV' },
  { label: 'Accounts', href: '/accounts', glyph: 'AC' },
  { label: 'Holdings', href: '/holdings', glyph: 'HO' },
  { label: 'Performance', href: '/performance', glyph: 'PF' },
  { label: 'Analytics', href: '/analytics', glyph: 'AN' },
  { label: 'Activity', href: '/activity', glyph: 'AT' },
  { label: 'Alerts', href: '/alerts', glyph: 'AL' },
  { label: 'Settings', href: '/settings', glyph: 'SE' },
] as const;

export function pathIsActive(pathname: string, href: string) {
  return href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`);
}
