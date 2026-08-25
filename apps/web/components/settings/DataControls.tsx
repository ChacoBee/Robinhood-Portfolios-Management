'use client';

import { useEffect, useState } from 'react';
import { csrfMutation } from '../../lib/api/csrf-mutation';

const demoConfirmation = 'DELETE SYNTHETIC DEMO';

export function DataControls({ mode, apiBaseUrl }: { mode: 'demo' | 'connected'; apiBaseUrl: string }) {
  const [retention, setRetention] = useState('30');
  const [typed, setTyped] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [exportState, setExportState] = useState<'available' | 'disabled' | 'loading'>(mode === 'connected' ? 'loading' : 'available');
  const [deletionState, setDeletionState] = useState<'available' | 'disabled' | 'loading'>(mode === 'connected' ? 'loading' : 'available');
  const [confirmation, setConfirmation] = useState(mode === 'demo' ? demoConfirmation : '');

  useEffect(() => {
    if (mode !== 'connected') return;
    let active = true;
    void Promise.all([
      fetch(`${apiBaseUrl}/v1/export/preview`, { credentials: 'include', cache: 'no-store' }),
      fetch(`${apiBaseUrl}/v1/delete/preview`, { credentials: 'include', cache: 'no-store' }),
    ]).then(async ([exportResponse, deletionResponse]) => {
      if (!active) return;
      const exportBody = exportResponse.ok ? await exportResponse.json() as { data?: { state?: string } } : null;
      const deletionBody = deletionResponse.ok ? await deletionResponse.json() as { data?: { state?: string; confirmationPhrase?: string } } : null;
      setExportState(exportBody?.data?.state === 'available' ? 'available' : 'disabled');
      setDeletionState(deletionBody?.data?.state === 'available' ? 'available' : 'disabled');
      setConfirmation(
        deletionBody?.data?.state === 'available' &&
        typeof deletionBody.data.confirmationPhrase === 'string'
          ? deletionBody.data.confirmationPhrase
          : '',
      );
    }).catch(() => {
      if (!active) return;
      setExportState('disabled');
      setDeletionState('disabled');
      setConfirmation('');
    });
    return () => { active = false; };
  }, [apiBaseUrl, mode]);

  async function exportData() {
    setMessage(null);
    if (mode === 'connected') {
      if (exportState !== 'available') return;
      setPending(true);
      try {
        const response = await csrfMutation(apiBaseUrl, '/v1/export', { method: 'POST' });
        if (!response.ok) throw new Error('export_failed');
        const body = await response.json() as { data?: { state?: string } };
        setMessage(`Private export ${body.data?.state ?? 'queued'}.`);
      } catch {
        setMessage('The private export could not be requested.');
      } finally {
        setPending(false);
      }
      return;
    }
    const blob = new Blob([
      JSON.stringify({ source: 'Synthetic Demo', exportedAt: new Date().toISOString(), note: 'No brokerage data is included.' }, null, 2),
    ], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'aurum-synthetic-demo-export.json';
    anchor.click();
    URL.revokeObjectURL(url);
    setMessage('Synthetic Demo export prepared.');
  }

  async function deleteData() {
    if (typed !== confirmation) return;
    if (mode === 'demo') {
      setMessage('Deletion simulated. Committed synthetic fixtures remain unchanged.');
      setTyped('');
      return;
    }
    if (deletionState !== 'available') return;
    setPending(true);
    setMessage(null);
    try {
      const response = await csrfMutation(apiBaseUrl, '/v1/delete', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ confirmation }),
      });
      if (!response.ok) throw new Error('deletion_failed');
      const body = await response.json() as { data?: { state?: string; backupExpiresAt?: string } };
      setMessage(`Deletion ${body.data?.state ?? 'scheduled'}. Backup expiry follows the server response.`);
    } catch {
      setMessage('Deletion was not scheduled. No client-side fallback was used.');
    } finally {
      setPending(false);
    }
    setTyped('');
  }

  return (
    <section className="settings-card settings-card-wide">
      <div><p className="eyebrow">Data controls</p><h2>Retention, export, and deletion</h2><p>High-frequency observations and import evidence have separate lifecycles. Deletion previews describe retained backups before any irreversible action.</p></div>
      <div className="data-control-grid">
        <label><span>Intraday retention</span><select onChange={(event) => setRetention(event.target.value)} value={retention}><option value="30">30 days</option><option value="60">60 days</option><option value="90">90 days</option></select><small>Daily rollups remain until owner deletion.</small></label>
        <div><span>Portable export</span><button className="secondary-button" disabled={pending || exportState !== 'available'} onClick={() => void exportData()} type="button">Export {mode === 'demo' ? 'synthetic data' : 'portfolio data'}</button><small>{exportState === 'loading' ? 'Checking private export capability…' : 'No credentials or raw provider payloads.'}</small></div>
      </div>
      <div className="danger-zone"><div><strong>Delete Aurum data</strong><p>{mode === 'demo' ? 'This preview can only simulate deletion.' : 'Connected deletion removes current facts and encrypted evidence; managed backups expire on their documented schedule.'}</p></div><label><span>{confirmation ? `Type ${confirmation}` : 'Deletion is unavailable'}</span><input autoComplete="off" disabled={!confirmation || pending} onChange={(event) => setTyped(event.target.value)} value={typed} /></label><button className="danger-button" disabled={!confirmation || typed !== confirmation || pending || deletionState !== 'available'} onClick={() => void deleteData()} type="button">{mode === 'demo' ? 'Preview deletion' : 'Schedule deletion'}</button></div>
      {message ? <p aria-live="polite" className="form-message">{message}</p> : null}
    </section>
  );
}
