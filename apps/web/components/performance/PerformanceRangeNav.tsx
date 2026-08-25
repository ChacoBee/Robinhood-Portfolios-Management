import type { PerformanceRange } from '@aurum/domain';
import Link from 'next/link';

const ranges: PerformanceRange[] = ['1W', '1M', '3M', 'YTD', '1Y', 'ALL'];

export function PerformanceRangeNav({ selected }: { selected: PerformanceRange }) {
  return (
    <nav aria-label="Performance range" className="range-selector">
      {ranges.map((range) => <Link aria-current={range === selected ? 'page' : undefined} className={range === selected ? 'is-active' : ''} href={`/performance?range=${range}`} key={range}>{range}</Link>)}
    </nav>
  );
}
