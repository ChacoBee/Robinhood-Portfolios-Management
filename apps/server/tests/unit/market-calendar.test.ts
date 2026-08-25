import { describe, expect, it } from 'vitest';
import { resolveUsEquitySession } from '../../src/sync/market-calendar';

describe('official US equity session calendar policy', () => {
  it('resolves a regular summer session in New York time', () => {
    expect(resolveUsEquitySession(new Date('2026-08-25T14:00:00.000Z'))).toMatchObject({
      phase: 'regular',
      lastRegularCloseAt: '2026-08-24T20:00:00.000Z',
      scheduleWindow: {
        kind: 'regular',
        openAt: '2026-08-25T13:30:00.000Z',
        closeAt: '2026-08-25T20:00:00.000Z',
        halfDay: false,
      },
    });
  });

  it('honors Juneteenth and the Thanksgiving Friday 1pm close', () => {
    expect(resolveUsEquitySession(new Date('2026-06-19T15:00:00.000Z'))).toMatchObject({
      phase: 'holiday',
      scheduleWindow: { kind: 'holiday' },
    });
    expect(resolveUsEquitySession(new Date('2026-11-27T17:00:00.000Z'))).toMatchObject({
      phase: 'regular',
      scheduleWindow: {
        closeAt: '2026-11-27T18:00:00.000Z',
        halfDay: true,
      },
    });
  });

  it('uses the latest completed close across weekends', () => {
    expect(resolveUsEquitySession(new Date('2026-08-30T16:00:00.000Z'))).toMatchObject({
      phase: 'holiday',
      lastRegularCloseAt: '2026-08-28T20:00:00.000Z',
      scheduleWindow: { kind: 'closed' },
    });
  });
});
