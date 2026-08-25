'use client';

import type { HoldingReadModel } from '@aurum/domain';
import { useMemo, useState } from 'react';
import { HoldingsTable } from '../tables/HoldingsTable';
import { EmptyState } from '../ui/EmptyState';

export function HoldingsExplorer({ holdings }: { holdings: HoldingReadModel[] }) {
  const [query, setQuery] = useState('');
  const [assetClass, setAssetClass] = useState('all');
  const assetClasses = useMemo(
    () => Array.from(new Set(holdings.map((holding) => holding.assetClass))).sort(),
    [holdings],
  );
  const filtered = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return holdings.filter((holding) => {
      const matchesQuery = !normalizedQuery || `${holding.symbol} ${holding.name}`.toLowerCase().includes(normalizedQuery);
      const matchesClass = assetClass === 'all' || holding.assetClass === assetClass;
      return matchesQuery && matchesClass;
    });
  }, [assetClass, holdings, query]);

  return (
    <section className="data-card" aria-labelledby="holdings-directory-title">
      <div className="card-heading-row">
        <div><p className="eyebrow">Directory</p><h2 id="holdings-directory-title">All positions</h2></div>
        <span className="result-count" aria-live="polite">{filtered.length} of {holdings.length}</span>
      </div>
      <div className="filter-bar">
        <label className="search-field"><span className="sr-only">Search holdings</span><input onChange={(event) => setQuery(event.target.value)} placeholder="Search symbol or name" type="search" value={query} /></label>
        <label className="select-field"><span>Asset class</span><select onChange={(event) => setAssetClass(event.target.value)} value={assetClass}><option value="all">All classes</option>{assetClasses.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
      </div>
      {filtered.length ? <HoldingsTable holdings={filtered} /> : <EmptyState title="No matching holdings" description="Try a different symbol, name, or asset class." />}
    </section>
  );
}
