import type { AllocationSliceReadModel } from '@aurum/domain';
import { FinancialValue } from '../ui/FinancialValue';
import { formatMoney, formatRatio } from '../../lib/formatters';

const toneColor = {
  gold: 'var(--gold)',
  sand: '#b39c72',
  green: 'var(--positive)',
  amber: 'var(--amber)',
  slate: '#7f8792',
} as const;

function gradientFor(slices: AllocationSliceReadModel[]) {
  let cursor = 0;
  const stops = slices.map((slice) => {
    const start = cursor;
    cursor += Number(slice.weight.value) * 100;
    return `${toneColor[slice.tone]} ${start}% ${Math.min(cursor, 100)}%`;
  });
  if (cursor < 100) stops.push(`var(--panel-soft) ${cursor}% 100%`);
  return `conic-gradient(${stops.join(', ')})`;
}

export function AllocationChart({ slices, label = 'Portfolio asset allocation' }: {
  slices: AllocationSliceReadModel[];
  label?: string;
}) {
  return (
    <div className="allocation-content">
      <div aria-label={label} className="allocation-ring" role="img" style={{ background: gradientFor(slices) }}>
        <span><strong>{slices.length}</strong><small>categories</small></span>
      </div>
      <ul className="allocation-list">
        {slices.map((item) => (
          <li key={item.key}>
            <span aria-hidden="true" className={`legend-dot ${item.tone}`} />
            <span className="allocation-name">{item.label}</span>
            <span className="allocation-value">
              <FinancialValue as="strong" value={formatMoney(item.value)} />
              <FinancialValue as="small" value={formatRatio(item.weight)} />
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
