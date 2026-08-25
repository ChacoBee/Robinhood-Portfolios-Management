export function PasskeySettings({ mode }: { mode: 'demo' | 'connected' }) {
  return (
    <section className="settings-card">
      <div><p className="eyebrow">Owner authentication</p><h2>Passkeys</h2><p>Connected production requires an invite-only owner identity and a recent domain-bound passkey authentication.</p></div>
      <div className="setting-row"><span><strong>Daily passkey verification</strong><small>{mode === 'demo' ? 'Not initialized in public Demo' : 'Configured in the private Clerk instance'}</small></span><span className={`status-chip ${mode === 'demo' ? 'is-unavailable' : 'is-partial'}`}>{mode === 'demo' ? 'Unavailable' : 'External setup'}</span></div>
      <button className="secondary-button" disabled type="button">Manage in private deployment</button>
    </section>
  );
}
