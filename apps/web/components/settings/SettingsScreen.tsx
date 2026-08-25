import { ScreenPrivacyToggle } from '../app-shell/ScreenPrivacyToggle';
import { ConnectionHealth } from './ConnectionHealth';
import { DataControls } from './DataControls';
import { NotificationSettings } from './NotificationSettings';
import { PasskeySettings } from './PasskeySettings';
import { RecoveryCodeSettings } from './RecoveryCodeSettings';

export function SettingsScreen({ mode }: { mode: 'demo' | 'connected' }) {
  return (
    <div className="settings-grid">
      <ConnectionHealth mode={mode} />
      <section className="settings-card"><div><p className="eyebrow">Display privacy</p><h2>Screen Privacy Mode</h2><p>Mask every financial value in this browser tab. The preference lives in session storage only and survives in-app navigation.</p></div><div className="setting-row"><span><strong>Mask financial values</strong><small>Useful while sharing your screen</small></span><ScreenPrivacyToggle /></div></section>
      <PasskeySettings mode={mode} />
      <RecoveryCodeSettings />
      <NotificationSettings mode={mode} />
      <section className="settings-card"><div><p className="eyebrow">Application safety</p><h2>Read-only by design</h2><p>Aurum displays and analyzes portfolio facts. Orders, transfers, cancellations, and account mutations are outside its connector allowlist.</p></div><ul className="security-list"><li><span aria-hidden="true">✓</span>No trade controls</li><li><span aria-hidden="true">✓</span>No credentials in browser storage</li><li><span aria-hidden="true">✓</span>Missing values remain unavailable</li></ul></section>
      <DataControls apiBaseUrl={mode === 'connected' ? '/api/aurum' : ''} mode={mode} />
    </div>
  );
}
