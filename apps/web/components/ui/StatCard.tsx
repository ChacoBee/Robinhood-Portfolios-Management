import type { ReactNode } from 'react';

export function StatCard({ label, value, detail, tone = 'default' }: {
  label: string;
  value: ReactNode;
  detail?: ReactNode;
  tone?: 'default' | 'positive' | 'negative' | 'neutral' | 'watch';
}) {
  return (
    <article className={`stat-card tone-${tone}`}>
      <p>{label}</p>
      <strong>{value}</strong>
      {detail ? <small>{detail}</small> : null}
    </article>
  );
}
