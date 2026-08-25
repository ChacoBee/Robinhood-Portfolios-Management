export function RecoveryCodeSettings() {
  return (
    <section className="settings-card">
      <div><p className="eyebrow">Account recovery</p><h2>Recovery codes</h2><p>A code alone never creates a normal session. Recovery additionally requires verified-email proof, revokes existing sessions, and permits only passkey re-enrollment for ten minutes.</p></div>
      <div className="inline-warning"><strong>Security gate</strong><p>Enrollment stays disabled until that dual-proof flow is verified end-to-end in the private identity provider.</p></div>
      <button className="secondary-button" disabled type="button">Generate codes after verification</button>
    </section>
  );
}
