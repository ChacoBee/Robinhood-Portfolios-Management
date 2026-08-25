'use client';

import { useState } from 'react';
import { csrfMutation } from '../../lib/api/csrf-mutation';

type SavedRule = { id: string; kind: string; threshold: string };

export function AlertRuleForm({ mode, apiBaseUrl }: { mode: 'demo' | 'connected'; apiBaseUrl: string }) {
  const [kind, setKind] = useState('concentration_threshold');
  const [threshold, setThreshold] = useState('0.30');
  const [cooldownSeconds, setCooldownSeconds] = useState('3600');
  const [dailyCap, setDailyCap] = useState('3');
  const [saved, setSaved] = useState<SavedRule[]>([]);
  const [message, setMessage] = useState<string | null>(null);

  async function saveRule(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    const payload = {
      kind,
      threshold,
      scopeId: null,
      cooldownSeconds: Number(cooldownSeconds),
      dailyCap: Number(dailyCap),
    };
    if (mode === 'demo') {
      setSaved((current) => [...current, { id: `demo-rule-${current.length + 1}`, kind, threshold }]);
      setMessage('Synthetic rule saved for this preview only.');
      return;
    }
    try {
      const response = await csrfMutation(apiBaseUrl, '/v1/alert-rules', {
        method: 'POST',
        headers: { accept: 'application/json', 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!response.ok) throw new Error('rule_failed');
      const envelope = (await response.json()) as { data?: { id?: string } };
      if (!envelope.data?.id) throw new Error('invalid_rule_response');
      setSaved((current) => [...current, { id: envelope.data!.id!, kind, threshold }]);
      setMessage('Alert rule saved.');
    } catch {
      setMessage('The rule could not be saved. Existing rules were not changed.');
    }
  }

  return (
    <section aria-labelledby="rule-builder-title" className="data-card">
      <div className="card-heading-row"><div><p className="eyebrow">Rule builder</p><h2 id="rule-builder-title">Create a factual alert</h2></div></div>
      <form className="rule-form" onSubmit={(event) => void saveRule(event)}>
        <label><span>Condition</span><select onChange={(event) => setKind(event.target.value)} value={kind}><option value="concentration_threshold">Concentration threshold</option><option value="portfolio_percentage_move">Portfolio percentage move</option><option value="cash_threshold">Cash threshold</option><option value="stale_sync">Stale sync</option><option value="data_health_failure">Data health failure</option></select></label>
        <label><span>Threshold</span><input inputMode="decimal" onChange={(event) => setThreshold(event.target.value)} pattern="\d+(\.\d+)?" required value={threshold} /></label>
        <label><span>Cooldown</span><select onChange={(event) => setCooldownSeconds(event.target.value)} value={cooldownSeconds}><option value="1800">30 minutes</option><option value="3600">1 hour</option><option value="14400">4 hours</option><option value="86400">1 day</option></select></label>
        <label><span>Daily cap</span><select onChange={(event) => setDailyCap(event.target.value)} value={dailyCap}><option value="1">1</option><option value="3">3</option><option value="5">5</option></select></label>
        <button className="primary-button" type="submit">Save rule</button>
      </form>
      <p className="form-helper">Movement rules use named baselines and are suppressed when data is stale, partial, unreconciled, or unsupported-dominant.</p>
      {message ? <p aria-live="polite" className="form-message">{message}</p> : null}
      {saved.length ? <ul className="saved-rule-list">{saved.map((rule) => <li key={rule.id}><strong>{rule.kind.replaceAll('_', ' ')}</strong><span>Threshold {rule.threshold}</span></li>)}</ul> : null}
    </section>
  );
}
