'use client';

import type { ActivityItemReadModel } from '@aurum/domain';
import { useMemo, useState } from 'react';
import { formatDateTime, formatMoney, valueDirection } from '../../lib/formatters';
import { EmptyState } from '../ui/EmptyState';
import { FinancialValue } from '../ui/FinancialValue';

const activityKinds = ['all', 'deposit', 'withdrawal', 'trade', 'dividend', 'sync', 'import'] as const;

export function ActivityTimeline({ items }: { items: ActivityItemReadModel[] }) {
  const [kind, setKind] = useState<(typeof activityKinds)[number]>('all');
  const filtered = useMemo(() => kind === 'all' ? items : items.filter((item) => item.kind === kind), [items, kind]);
  return (
    <section className="data-card" aria-labelledby="activity-timeline-title">
      <div className="card-heading-row"><div><p className="eyebrow">Ledger</p><h2 id="activity-timeline-title">Recent activity</h2></div><label className="select-field compact"><span className="sr-only">Filter activity type</span><select onChange={(event) => setKind(event.target.value as typeof kind)} value={kind}>{activityKinds.map((item) => <option key={item} value={item}>{item === 'all' ? 'All activity' : item[0]!.toUpperCase() + item.slice(1)}</option>)}</select></label></div>
      {filtered.length ? <ol className="activity-list">{filtered.map((item) => (
        <li key={item.id}>
          <span aria-hidden="true" className={`activity-icon kind-${item.kind}`}>{item.kind.slice(0, 2).toUpperCase()}</span>
          <div><div className="activity-title-row"><strong>{item.title}</strong><span className="status-chip">{item.source}</span></div><p>{item.description}</p><small>{formatDateTime(item.at)}</small></div>
          <FinancialValue className={valueDirection(item.amount)} unavailable={!item.amount} value={item.amount ? formatMoney(item.amount, { sign: item.kind === 'deposit' || item.kind === 'dividend' }) : '—'} />
        </li>
      ))}</ol> : <EmptyState title="No matching activity" description="Choose another activity type to continue." />}
    </section>
  );
}
