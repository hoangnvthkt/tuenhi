import { describe, expect, it } from 'vitest';
import {
  operationalDashboardSchema,
  revenueReportSchema,
} from './report-schemas';

const dashboard = {
  version: 1,
  timezone: 'Asia/Ho_Chi_Minh',
  catalog: {
    activeProductCount: 1,
    lowStockCount: 1,
    outOfStockCount: 1,
    totalOnHandQty: '-2',
  },
  pending: { purchaseReceipts: 0, stockCounts: 0, saleReturns: 0 },
};

describe('dashboard stock quantity', () => {
  it('accepts a negative total on-hand quantity', () => {
    expect(
      operationalDashboardSchema.parse(dashboard).catalog.totalOnHandQty,
    ).toBe('-2');
  });

  it.each(['-0', '-01', '+1', '1.0', '-1.5', '01', ' 1', '1e3'])(
    'rejects malformed stock total %j',
    (totalOnHandQty) => {
      expect(
        operationalDashboardSchema.safeParse({
          ...dashboard,
          catalog: { ...dashboard.catalog, totalOnHandQty },
        }).success,
      ).toBe(false);
    },
  );

  it.each([
    ['1', true],
    ['-1', false],
    ['1.5', false],
  ])('keeps sold quantity %j valid=%s', (quantity, accepted) => {
    expect(
      revenueReportSchema.shape.summary.shape.soldQuantity.safeParse(quantity)
        .success,
    ).toBe(accepted);
  });
});
