'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { pathIsActive } from './navigation';
import { useIslandReady } from '../../lib/client/use-island-ready';

const directTabs = [
  { label: 'Overview', href: '/', glyph: 'OV' },
  { label: 'Holdings', href: '/holdings', glyph: 'HO' },
  { label: 'Activity', href: '/activity', glyph: 'AT' },
  { label: 'Alerts', href: '/alerts', glyph: 'AL' },
] as const;
const moreTabs = [
  { label: 'Accounts', href: '/accounts' },
  { label: 'Performance', href: '/performance' },
  { label: 'Analytics', href: '/analytics' },
  { label: 'Settings', href: '/settings' },
] as const;

export function MobileTabBar() {
  const ready = useIslandReady();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const moreActive = moreTabs.some((item) => pathIsActive(pathname, item.href));

  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape') return;
      setOpen(false);
      buttonRef.current?.focus();
    }
    function onPointerDown(event: PointerEvent) {
      if (containerRef.current?.contains(event.target as Node)) return;
      setOpen(false);
    }
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('pointerdown', onPointerDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('pointerdown', onPointerDown);
    };
  }, [open]);

  return (
    <nav aria-busy={!ready} aria-label="Mobile primary" className="mobile-tab-bar" data-aurum-island="mobile-navigation" data-aurum-ready={ready ? 'true' : 'false'} inert={!ready}>
      {directTabs.map((item) => (
        <Link
          aria-current={pathIsActive(pathname, item.href) ? 'page' : undefined}
          className="mobile-tab"
          href={item.href}
          key={item.href}
        >
          <span aria-hidden="true">{item.glyph}</span>
          <small>{item.label}</small>
        </Link>
      ))}
      <div className="mobile-more" ref={containerRef}>
        {open ? (
          <div aria-label="More pages" className="mobile-more-menu" role="menu">
            {moreTabs.map((item) => (
              <Link
                aria-current={pathIsActive(pathname, item.href) ? 'page' : undefined}
                href={item.href}
                key={item.href}
                onClick={() => setOpen(false)}
                role="menuitem"
              >
                {item.label}
              </Link>
            ))}
          </div>
        ) : null}
        <button
          aria-current={moreActive ? 'page' : undefined}
          aria-expanded={open}
          aria-haspopup="menu"
          aria-label="More navigation"
          className="mobile-tab"
          disabled={!ready}
          onClick={() => setOpen((current) => !current)}
          ref={buttonRef}
          type="button"
        >
          <span aria-hidden="true">•••</span>
          <small>More</small>
        </button>
      </div>
    </nav>
  );
}
