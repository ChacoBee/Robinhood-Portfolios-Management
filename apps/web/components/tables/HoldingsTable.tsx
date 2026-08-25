import type { HoldingReadModel } from '@aurum/domain';
import Link from 'next/link';
import { formatMoney, formatRatio, valueDirection } from '../../lib/formatters';
import { FinancialValue } from '../ui/FinancialValue';

export function HoldingsTable({ holdings, label = 'Portfolio holdings' }: {
  holdings: HoldingReadModel[];
  label?: string;
}) {
  return (
    <div aria-label={`${label}, horizontally scrollable`} className="table-scroll" role="region" tabIndex={0}>
      <table aria-label={label} className="holdings-table">
        <thead><tr><th scope="col">Holding</th><th scope="col">Market value</th><th scope="col">Allocation</th><th scope="col">Today</th><th scope="col">Quote</th></tr></thead>
        <tbody>
          {holdings.map((holding) => {
            const direction = valueDirection(holding.dailyChange);
            return (
              <tr key={holding.instrumentId}>
                <th scope="row">
                  <Link className="holding-link" href={`/holdings/${encodeURIComponent(holding.instrumentId)}`}>
                    <span className="holding-symbol">{holding.symbol}</span>
                    <span className="holding-name">{holding.name}</span>
                  </Link>
                </th>
                <td><FinancialValue value={formatMoney(holding.marketValue)} /></td>
                <td><FinancialValue value={formatRatio(holding.allocation)} /></td>
                <td className={direction}><FinancialValue value={formatRatio(holding.dailyChangeRatio, { sign: true })} unavailable={!holding.dailyChangeRatio} /></td>
                <td><span className={`status-chip is-${holding.quoteStatus}`}>{holding.quoteStatus}</span></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
