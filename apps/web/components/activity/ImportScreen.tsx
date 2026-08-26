'use client';

import { useMemo, useRef, useState } from 'react';
import { formatMoney } from '../../lib/formatters';
import { csrfMutation } from '../../lib/api/csrf-mutation';
import { FinancialValue } from '../ui/FinancialValue';
import { useIslandReady } from '../../lib/client/use-island-ready';

type ImportDecision = 'accepted' | 'duplicate' | 'review_required' | 'rejected';
type PreviewRow = {
  candidate: null | {
    id: string;
    kind: string;
    amount: { amount: string; currency: 'USD' };
    effectiveAt: string;
    description: string;
    sourceLocation: string;
  };
  decision: ImportDecision;
  messages: string[];
  sourceLocation: string;
};
type Preview = {
  id: string;
  filename: string;
  acceptedRows: number;
  duplicateRows: number;
  ambiguousRows: number;
  rejectedRows: number;
  rows: PreviewRow[];
};

const demoPreview: Preview = {
  id: 'demo-import-preview',
  filename: 'synthetic-activity-v1.csv',
  acceptedRows: 2,
  duplicateRows: 1,
  ambiguousRows: 1,
  rejectedRows: 0,
  rows: [
    {
      candidate: {
        id: 'demo-row-1',
        kind: 'deposit',
        amount: { amount: '500', currency: 'USD' },
        effectiveAt: '2026-08-01T12:00:00.000Z',
        description: 'Synthetic fixture deposit',
        sourceLocation: 'row 2',
      },
      decision: 'accepted',
      messages: ['No prior source identity found.'],
      sourceLocation: 'row 2',
    },
    {
      candidate: {
        id: 'demo-row-2',
        kind: 'dividend',
        amount: { amount: '7.25', currency: 'USD' },
        effectiveAt: '2026-08-08T12:00:00.000Z',
        description: 'Synthetic fixture distribution',
        sourceLocation: 'row 3',
      },
      decision: 'accepted',
      messages: ['No prior source identity found.'],
      sourceLocation: 'row 3',
    },
    {
      candidate: null,
      decision: 'duplicate',
      messages: ['Exact synthetic source identity already exists.'],
      sourceLocation: 'row 4',
    },
    {
      candidate: null,
      decision: 'review_required',
      messages: ['A near match needs owner review before it can be imported.'],
      sourceLocation: 'row 5',
    },
  ],
};

async function fileToBase64(file: File): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export function ImportScreen({
  mode,
  apiBaseUrl,
}: {
  mode: 'demo' | 'connected';
  apiBaseUrl: string;
}) {
  const ready = useIslandReady();
  const [preview, setPreview] = useState<Preview | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [state, setState] = useState<'select' | 'preview' | 'confirming' | 'complete'>('select');
  const [message, setMessage] = useState<string | null>(null);
  const [accountId, setAccountId] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const selectedRows = useMemo(
    () => preview?.rows.filter((row) => row.candidate && selected.has(row.candidate.id)) ?? [],
    [preview, selected],
  );

  function loadDemo() {
    const ids = demoPreview.rows.flatMap((row) =>
      row.decision === 'accepted' && row.candidate ? [row.candidate.id] : [],
    );
    setPreview(demoPreview);
    setSelected(new Set(ids));
    setState('preview');
    setMessage(null);
  }

  async function loadConnectedFile(file: File) {
    setMessage(null);
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(accountId)) {
      setMessage('Select a valid connected account before choosing a file.');
      return;
    }
    if (!['text/csv', 'application/pdf'].includes(file.type)) {
      setMessage('Choose a CSV or PDF file. Your current selection was not uploaded.');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setMessage('The file is larger than the 10 MB import limit.');
      return;
    }
    try {
      const response = await csrfMutation(apiBaseUrl, '/v1/imports/preview', {
        method: 'POST',
        headers: { accept: 'application/json', 'content-type': 'application/json' },
        body: JSON.stringify({
          accountId,
          filename: file.name,
          mediaType: file.type,
          contentBase64: await fileToBase64(file),
        }),
      });
      if (!response.ok) throw new Error('preview_failed');
      const envelope = (await response.json()) as { data?: Preview };
      if (!envelope.data || !Array.isArray(envelope.data.rows)) throw new Error('invalid_preview');
      setPreview(envelope.data);
      setSelected(
        new Set(
          envelope.data.rows.flatMap((row) =>
            row.decision === 'accepted' && row.candidate ? [row.candidate.id] : [],
          ),
        ),
      );
      setState('preview');
    } catch {
      setMessage('The import preview could not be created. Your file selection was preserved.');
    }
  }

  async function confirmSelection() {
    if (!preview || selectedRows.length === 0) return;
    setState('confirming');
    setMessage(null);
    if (mode === 'demo') {
      setState('complete');
      return;
    }
    try {
      const response = await csrfMutation(apiBaseUrl, '/v1/imports/confirm', {
        method: 'POST',
        headers: { accept: 'application/json', 'content-type': 'application/json' },
        body: JSON.stringify({
          previewId: preview.id,
          selectedCandidateIds: [...selected],
        }),
      });
      if (!response.ok) throw new Error('confirm_failed');
      setState('complete');
    } catch {
      setMessage('Confirmation failed. Your preview and row selections are still available.');
      setState('preview');
    }
  }

  function downloadErrors() {
    if (!preview) return;
    const lines = preview.rows
      .filter((row) => row.decision !== 'accepted')
      .map((row) => `${row.sourceLocation}\t${row.decision}\t${row.messages.join('; ')}`);
    const url = URL.createObjectURL(new Blob([`location\tstate\tmessage\n${lines.join('\n')}`], { type: 'text/tab-separated-values' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'aurum-import-review.tsv';
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <section aria-busy={!ready} aria-labelledby="import-title" className="data-card import-workflow" data-aurum-island="import-screen" data-aurum-ready={ready ? 'true' : 'false'} inert={!ready}>
      <div className="import-steps" aria-label="Import progress">
        {['Select', 'Preview', 'Confirm'].map((label, index) => {
          const active = state === 'select' ? 0 : state === 'preview' || state === 'confirming' ? 1 : 2;
          return <span className={index <= active ? 'is-active' : ''} key={label}><b>{index + 1}</b>{label}</span>;
        })}
      </div>

      <div className="card-heading-row">
        <div>
          <p className="eyebrow">Activity history</p>
          <h2 id="import-title">Preview before importing</h2>
        </div>
        {preview && state !== 'complete' ? <button className="text-button" onClick={() => { setPreview(null); setSelected(new Set()); setState('select'); }} type="button">Start over</button> : null}
      </div>

      {state === 'select' ? (
        <div className="import-dropzone">
          <div aria-hidden="true" className="import-symbol">CSV</div>
          <h3>{mode === 'demo' ? 'Open the safe synthetic fixture' : 'Select a Robinhood CSV or statement PDF'}</h3>
          <p>{mode === 'demo' ? 'No local file leaves your device in this public preview.' : 'Aurum validates type, size, rows, formulas, and duplicates before confirmation.'}</p>
          {mode === 'demo' ? (
            <button className="primary-button" onClick={loadDemo} type="button">Load synthetic fixture</button>
          ) : (
            <>
              <label className="import-account-field">
                <span>Connected account ID</span>
                <input
                  autoComplete="off"
                  onChange={(event) => setAccountId(event.target.value.trim())}
                  placeholder="Account UUID"
                  value={accountId}
                />
                <small>Use the account identifier shown in your private Accounts view.</small>
              </label>
              <input
                accept=".csv,.pdf,text/csv,application/pdf"
                className="sr-only"
                onChange={(event) => {
                  const file = event.currentTarget.files?.[0];
                  if (file) void loadConnectedFile(file);
                }}
                ref={inputRef}
                type="file"
              />
              <button className="primary-button" onClick={() => inputRef.current?.click()} type="button">Choose file</button>
            </>
          )}
          <small>CSV or PDF · 10 MB maximum · PDF entries always require review</small>
        </div>
      ) : null}

      {preview && state !== 'select' ? (
        <>
          <div className="stats-grid four import-summary">
            <div><strong>{preview.acceptedRows}</strong><span>Ready</span></div>
            <div><strong>{preview.duplicateRows}</strong><span>Duplicate</span></div>
            <div><strong>{preview.ambiguousRows}</strong><span>Review</span></div>
            <div><strong>{preview.rejectedRows}</strong><span>Rejected</span></div>
          </div>
          <div aria-label="Import preview rows" className="table-scroll" role="region" tabIndex={0}>
            <table className="data-table import-table">
              <thead><tr><th scope="col">Include</th><th scope="col">Source</th><th scope="col">Event</th><th scope="col">Amount</th><th scope="col">Decision</th><th scope="col">Message</th></tr></thead>
              <tbody>{preview.rows.map((row) => {
                const id = row.candidate?.id;
                return <tr key={`${row.sourceLocation}-${id ?? row.decision}`}>
                  <td>{id && row.decision === 'accepted' ? <input aria-label={`Include ${row.sourceLocation}`} checked={selected.has(id)} onChange={() => setSelected((current) => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; })} type="checkbox" /> : '—'}</td>
                  <th scope="row">{row.sourceLocation}</th>
                  <td>{row.candidate ? <><strong>{row.candidate.description}</strong><small>{row.candidate.kind}</small></> : 'Unavailable'}</td>
                  <td>{row.candidate ? <FinancialValue value={formatMoney(row.candidate.amount)} /> : '—'}</td>
                  <td><span className={`status-chip is-${row.decision}`}>{row.decision.replaceAll('_', ' ')}</span></td>
                  <td>{row.messages.join(' ')}</td>
                </tr>;
              })}</tbody>
            </table>
          </div>
          <div className="import-actions">
            <button className="secondary-button" disabled={!preview.rows.some((row) => row.decision !== 'accepted')} onClick={downloadErrors} type="button">Download review report</button>
            {state === 'complete' ? <p role="status"><strong>Import complete.</strong> {mode === 'demo' ? 'This changed only the local synthetic preview.' : 'Selected facts were recorded with source lineage.'}</p> : <button className="primary-button" disabled={selectedRows.length === 0 || state === 'confirming'} onClick={() => void confirmSelection()} type="button">{state === 'confirming' ? 'Confirming…' : `Confirm ${selectedRows.length} selected`}</button>}
          </div>
        </>
      ) : null}
      {message ? <p className="inline-error" role="alert">{message}</p> : null}
    </section>
  );
}
