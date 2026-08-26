import type { SVGProps } from 'react';

export type NavigationIconName =
  | 'dashboard'
  | 'accounts'
  | 'holdings'
  | 'performance'
  | 'allocation'
  | 'activity'
  | 'alerts'
  | 'settings';

const paths: Record<NavigationIconName, readonly string[]> = {
  dashboard: ['M3 3h5v5H3z', 'M12 3h5v5h-5z', 'M3 12h5v5H3z', 'M12 12h5v5h-5z'],
  accounts: ['M3 6h14', 'M5 10h10', 'M7 14h6'],
  holdings: ['M4 5h12', 'M4 10h12', 'M4 15h12'],
  performance: ['M3 15l4-4 3 2 6-7', 'M13 6h3v3'],
  allocation: ['M10 3a7 7 0 1 0 7 7h-7z', 'M12 3.3V8h4.7A7 7 0 0 0 12 3.3z'],
  activity: ['M3 10h3l2-5 4 10 2-5h3'],
  alerts: ['M5 14h10l-1.5-2V8a3.5 3.5 0 0 0-7 0v4z', 'M8.5 16h3'],
  settings: ['M10 6.5A3.5 3.5 0 1 0 10 13.5 3.5 3.5 0 0 0 10 6.5z', 'M10 2v2', 'M10 16v2', 'M2 10h2', 'M16 10h2'],
};

export function NavigationIcon({ name, ...props }: { name: NavigationIconName } & SVGProps<SVGSVGElement>) {
  return (
    <svg {...props} aria-hidden="true" className="nav-icon" fill="none" viewBox="0 0 20 20">
      {paths[name].map((path) => (
        <path d={path} key={path} stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.4" />
      ))}
    </svg>
  );
}
