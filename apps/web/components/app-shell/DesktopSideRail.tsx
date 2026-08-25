const primaryNavigation = [
  ['Overview', 'O'],
  ['Accounts', 'A'],
  ['Holdings', 'H'],
  ['Performance', 'P'],
  ['Analytics', 'N'],
  ['Activity', 'T'],
  ['Alerts', '!'],
  ['Settings', 'S'],
] as const;

export function DesktopSideRail() {
  return (
    <aside aria-label="Primary" className="side-rail">
      <a className="brand" href="#overview" aria-label="Aurum overview">
        <span aria-hidden="true" className="brand-mark">
          A
        </span>
        <span>
          <strong>Aurum</strong>
          <small>Portfolio intelligence</small>
        </span>
      </a>

      <nav className="side-navigation">
        {primaryNavigation.map(([label, glyph], index) => (
          <a
            aria-current={index === 0 ? 'page' : undefined}
            className="nav-link"
            href={index === 0 ? '#overview' : `#${label.toLowerCase()}`}
            key={label}
          >
            <span aria-hidden="true" className="nav-glyph">
              {glyph}
            </span>
            {label}
          </a>
        ))}
      </nav>

      <div className="rail-connection">
        <span aria-hidden="true" className="connection-dot" />
        <span>
          <strong>Demo workspace</strong>
          <small>No brokerage connected</small>
        </span>
      </div>
    </aside>
  );
}
