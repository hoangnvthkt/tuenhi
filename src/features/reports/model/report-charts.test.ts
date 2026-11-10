import { describe, expect, it } from 'vitest';
import { moneyShare, revenueBuckets, revenueFlow } from './report-charts';

describe('report charts', () => {
  it('fills every day of a short range and groups long ranges by month', () => {
    const daily = [{ day: '2026-11-10', netRevenue: '143000' }] as never;
    expect(
      revenueBuckets(daily, '2026-11-09', '2026-11-11').map((b) => [
        b.label,
        b.netRevenue,
      ]),
    ).toEqual([
      ['9/11', '0'],
      ['10/11', '143000'],
      ['11/11', '0'],
    ]);
    const months = revenueBuckets(daily, '2026-10-01', '2026-11-30');
    expect(months.map((b) => [b.label, b.from, b.to, b.netRevenue])).toEqual([
      ['T10/26', '2026-10-01', '2026-10-31', '0'],
      ['T11/26', '2026-11-01', '2026-11-30', '143000'],
    ]);
  });

  it('places each deduction where it bites and ends at net revenue', () => {
    const rows = revenueFlow({
      completedOrderCount: 2,
      soldQuantity: '3',
      grossSales: '251000',
      lineDiscounts: '30000',
      orderDiscounts: '1600',
      salesReturns: '76400',
      cancellations: '0',
      netRevenue: '143000',
      averageOrderValue: null,
    });
    expect(rows.map((r) => [r.key, r.amount, r.offset, r.width])).toEqual([
      ['gross', '251000', 0, 100],
      ['discounts', '31600', 87.4, 12.5],
      ['returns', '76400', 56.9, 30.4],
      ['cancellations', '0', 56.9, 0],
      ['net', '143000', 0, 56.9],
    ]);
  });

  it('never divides by zero', () => {
    expect(moneyShare('10', '0')).toBe(0);
    expect(moneyShare('-5', '10')).toBe(0);
  });
});
