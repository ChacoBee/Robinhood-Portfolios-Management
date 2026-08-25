'use client';

import type { AlertReadModel } from '@aurum/domain';
import { useEffect, useMemo, useState } from 'react';
import { formatDateTime } from '../../lib/formatters';
import { csrfMutation } from '../../lib/api/csrf-mutation';
import { EmptyState } from '../ui/EmptyState';
import { AlertEvidence } from './AlertEvidence';

export function AlertsCenter({ alerts, sourceAsOf, mode, apiBaseUrl }: { alerts: AlertReadModel[]; sourceAsOf: string | null; mode: 'demo' | 'connected'; apiBaseUrl: string }) {
  const [items, setItems] = useState(alerts);
  const [state, setState] = useState<'all' | 'new' | 'read'>('all');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [muted, setMuted] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      alerts
        .filter((alert) => alert.mutedUntil)
        .map((alert) => [alert.id, alert.mutedUntil!]),
    ),
  );
  const [pending, setPending] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const filtered = useMemo(() => state === 'all' ? items : items.filter((alert) => alert.state === state), [items, state]);
  useEffect(() => {
    const expirations = Object.values(muted)
      .map((value) => Date.parse(value))
      .filter(Number.isFinite);
    if (!expirations.length) return;
    const delay = Math.max(0, Math.min(...expirations) - Date.now());
    const timer = window.setTimeout(() => {
      const currentTime = Date.now();
      setMuted((current) => Object.fromEntries(
        Object.entries(current).filter(([, until]) => Date.parse(until) > currentTime),
      ));
    }, Math.min(delay, 2_147_483_647));
    return () => window.clearTimeout(timer);
  }, [muted]);
  async function persist(path: string, method: 'POST' | 'DELETE') {
    if (mode === 'demo') return;
    const response = await csrfMutation(apiBaseUrl, path, { method });
    if (!response.ok) throw new Error('alert_action_failed');
  }
  async function markRead(id: string) {
    const previous = items;
    setItems((current) => current.map((alert) => alert.id === id ? { ...alert, state: 'read' } : alert));
    setPending(id);
    setMessage(null);
    try {
      await persist(`/v1/alerts/${encodeURIComponent(id)}/read`, 'POST');
    } catch {
      setItems(previous);
      setMessage('The alert could not be updated. No server state was changed.');
    } finally {
      setPending(null);
    }
  }
  async function snooze(id: string) {
    const previous = { ...muted };
    const until = new Date(Date.now() + 24 * 60 * 60 * 1_000).toISOString();
    setMuted((current) => ({ ...current, [id]: until }));
    setPending(id);
    setMessage(null);
    try {
      if (mode === 'connected') {
        const response = await csrfMutation(
          apiBaseUrl,
          `/v1/alerts/${encodeURIComponent(id)}/mute`,
          {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ until }),
          },
        );
        if (!response.ok) throw new Error('alert_action_failed');
      }
    } catch {
      setMuted(previous);
      setMessage('The alert could not be snoozed. No server state was changed.');
    } finally {
      setPending(null);
    }
  }
  async function unmute(id: string) {
    const previous = { ...muted };
    setMuted((current) => {
      const next = { ...current };
      delete next[id];
      return next;
    });
    setPending(id);
    setMessage(null);
    try {
      await persist(`/v1/alerts/${encodeURIComponent(id)}/mute`, 'DELETE');
    } catch {
      setMuted(previous);
      setMessage('The alert could not be unmuted. No server state was changed.');
    } finally {
      setPending(null);
    }
  }
  return (
    <section className="data-card" aria-labelledby="alerts-list-title">
      <div className="card-heading-row"><div><p className="eyebrow">Inbox</p><h2 id="alerts-list-title">Portfolio alerts</h2></div><div aria-label="Filter alerts" className="segmented-control">{(['all', 'new', 'read'] as const).map((item) => <button aria-pressed={state === item} key={item} onClick={() => setState(item)} type="button">{item[0]!.toUpperCase() + item.slice(1)}</button>)}</div></div>
      {filtered.length ? <ul className="alert-list">{filtered.map((alert) => <li className={`severity-${alert.severity}`} key={alert.id}><span aria-hidden="true" className="alert-marker" /><div><div className="activity-title-row"><strong>{alert.title}</strong><span className={`status-chip is-${alert.state}`}>{alert.state}</span>{muted[alert.id] ? <span className="status-chip is-partial">Snoozed</span> : null}</div><p>{alert.description}</p><small>{formatDateTime(alert.createdAt)} · {alert.severity}</small><div className="alert-actions">{alert.state === 'new' ? <button disabled={pending === alert.id} onClick={() => void markRead(alert.id)} type="button">Mark read</button> : null}<button aria-expanded={expanded === alert.id} onClick={() => setExpanded((current) => current === alert.id ? null : alert.id)} type="button">Evidence</button><button disabled={pending === alert.id} onClick={() => void snooze(alert.id)} type="button">Snooze 24h</button>{muted[alert.id] ? <button disabled={pending === alert.id} onClick={() => void unmute(alert.id)} type="button">Unmute</button> : null}</div>{expanded === alert.id ? <AlertEvidence alert={alert} sourceAsOf={sourceAsOf} /> : null}</div></li>)}</ul> : <EmptyState title="No alerts in this view" description="Your selected alert state is clear." />}
      {message ? <p className="inline-error" role="alert">{message}</p> : null}
    </section>
  );
}
