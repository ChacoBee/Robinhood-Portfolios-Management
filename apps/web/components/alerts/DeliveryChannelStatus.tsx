export function DeliveryChannelStatus({ mode }: { mode: 'demo' | 'connected' }) {
  const channels = [
    { label: 'In-app inbox', available: true, detail: 'Always available' },
    { label: 'Email', available: false, detail: mode === 'demo' ? 'Not configured in Demo' : 'Requires Resend credentials' },
    { label: 'Web push', available: false, detail: mode === 'demo' ? 'Not configured in Demo' : 'Requires VAPID configuration' },
  ];
  return (
    <section aria-labelledby="delivery-title" className="data-card">
      <div className="card-heading-row"><div><p className="eyebrow">Delivery</p><h2 id="delivery-title">Notification channels</h2></div></div>
      <ul className="channel-list">{channels.map((channel) => <li key={channel.label}><span><strong>{channel.label}</strong><small>{channel.detail}</small></span><span className={`status-chip ${channel.available ? 'is-active' : 'is-unavailable'}`}>{channel.available ? 'Active' : 'Unavailable'}</span></li>)}</ul>
    </section>
  );
}
