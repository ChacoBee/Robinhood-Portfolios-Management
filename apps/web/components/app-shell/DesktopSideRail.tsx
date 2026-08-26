'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { NavigationIcon } from './NavigationIcon';
import { pathIsActive, primaryNavigation } from './navigation';

export function DesktopSideRail({ mode }: { mode: 'demo' | 'connected' }) {
  const pathname = usePathname();

  return (
    <aside aria-label="Primary" className="side-rail">
      <Link className="brand" href="/" aria-label="Aurum overview">
        <span aria-hidden="true" className="brand-mark">A</span>
        <span>
          <strong>Aurum</strong>
          <small>Portfolio intelligence</small>
        </span>
      </Link>

      <nav className="side-navigation">
        {primaryNavigation.map((item) => (
          <Link
            aria-current={pathIsActive(pathname, item.href) ? 'page' : undefined}
            className="nav-link"
            href={item.href}
            key={item.href}
          >
            <NavigationIcon name={item.icon} />
            {item.label}
          </Link>
        ))}
      </nav>

      <div className="rail-connection">
        <span aria-hidden="true" className="connection-dot" />
        <span>
          <strong>{mode === 'demo' ? 'Demo workspace' : 'Connected mode'}</strong>
          <small>{mode === 'demo' ? 'No brokerage connected' : 'Verification required'}</small>
        </span>
      </div>
      <p className="rail-read-only">Read-only · No trading access</p>
    </aside>
  );
}
