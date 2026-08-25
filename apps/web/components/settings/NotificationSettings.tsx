export function NotificationSettings({ mode }: { mode: 'demo' | 'connected' }) {
  return (
    <section className="settings-card">
      <div><p className="eyebrow">Notifications</p><h2>Delivery channels</h2><p>External messages are sparse by default and never include balances or account identifiers.</p></div>
      <ul className="channel-list"><li><span><strong>In-app inbox</strong><small>Private dashboard evidence</small></span><span className="status-chip is-active">Active</span></li><li><span><strong>Email</strong><small>{mode === 'demo' ? 'No provider configured' : 'Requires managed Resend credentials'}</small></span><span className="status-chip is-unavailable">Unavailable</span></li><li><span><strong>Web push</strong><small>{mode === 'demo' ? 'No VAPID keys configured' : 'Requires private VAPID configuration'}</small></span><span className="status-chip is-unavailable">Unavailable</span></li></ul>
    </section>
  );
}
