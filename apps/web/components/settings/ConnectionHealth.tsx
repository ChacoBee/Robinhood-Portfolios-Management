export function ConnectionHealth({ mode }: { mode: 'demo' | 'connected' }) {
  const rows = mode === 'demo'
    ? [
        ['Brokerage', 'Not connected'],
        ['Database', 'Not used'],
        ['Background worker', 'Not used'],
        ['Granted scopes', 'None'],
      ]
    : [
        ['Brokerage', 'Requires verified app grant'],
        ['Database', 'Private runtime'],
        ['Background worker', 'Private runtime'],
        ['Granted scopes', 'Read-only verification required'],
      ];
  return (
    <section className="settings-card">
      <div><p className="eyebrow">Connection health</p><h2>{mode === 'demo' ? 'Synthetic Demo' : 'Connected-mode gates'}</h2><p>{mode === 'demo' ? 'No Robinhood account, OAuth grant, database, or worker is initialized.' : 'Aurum fails closed unless the private API verifies owner identity and the worker verifies the exact read-only grant.'}</p></div>
      <dl className="settings-detail-list">{rows.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
      <span className="source-badge"><span aria-hidden="true" className="source-dot" />{mode === 'demo' ? 'No brokerage connected' : 'Verification required'}</span>
    </section>
  );
}
