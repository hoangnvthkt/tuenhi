import { describe, expect, it } from 'vitest';
import { formatDay, groupByDay, purchasePeriod } from './purchase-days';

describe('purchase days', () => {
  it('builds a day or month range', () => {
    expect(purchasePeriod('2026-12', '2026-12-12')).toEqual({
      from: '2026-12-12',
      to: '2026-12-12',
    });
    expect(purchasePeriod('2026-02', '')).toEqual({
      from: '2026-02-01',
      to: '2026-02-28',
    });
    expect(purchasePeriod('', '')).toBeUndefined();
    expect(purchasePeriod('2026-13', 'x')).toBeUndefined();
  });

  it('groups by Vietnam day, newest first', () => {
    const groups = groupByDay([
      { id: 'a', receivedAt: '2026-12-11T16:59:59Z' },
      { id: 'b', receivedAt: '2026-12-11T17:00:00Z' },
      { id: 'c', receivedAt: '2026-12-12T09:00:00Z' },
    ]);
    expect(groups.map((g) => [g.day, g.items.map((i) => i.id)])).toEqual([
      ['2026-12-12', ['b', 'c']],
      ['2026-12-11', ['a']],
    ]);
    expect(formatDay('2026-12-12')).toBe('12/12/2026');
  });
});
