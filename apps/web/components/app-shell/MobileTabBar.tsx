const tabs = [
  ['Overview', 'O'],
  ['Holdings', 'H'],
  ['Activity', 'T'],
  ['Alerts', '!'],
  ['More', '···'],
] as const;

export function MobileTabBar() {
  return (
    <nav aria-label="Mobile primary" className="mobile-tab-bar">
      {tabs.map(([label, glyph], index) => (
        <a
          aria-current={index === 0 ? 'page' : undefined}
          className="mobile-tab"
          href={index === 0 ? '#overview' : `#${label.toLowerCase()}`}
          key={label}
        >
          <span aria-hidden="true">{glyph}</span>
          <small>{label}</small>
        </a>
      ))}
    </nav>
  );
}
