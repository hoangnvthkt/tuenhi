import { describe, expect, it } from 'vitest';
import { saleLineSchema } from './sales-schemas';

describe('sale line quantities', () => {
  it.each([
    ['1', true],
    ['-1', false],
    ['+1', false],
    ['1.5', false],
    ['01', false],
  ])('validates sale quantity %j as %s', (quantity, accepted) => {
    expect(
      saleLineSchema.safeParse({
        id: '10000000-0000-4000-8000-000000000001',
        productId: '20000000-0000-4000-8000-000000000002',
        productName: 'Sản phẩm mẫu',
        sku: 'SP-001',
        unitName: 'Hộp',
        lineOrder: 0,
        quantity,
        unitSalePrice: '25000',
        grossAmount: '25000',
        lineDiscountAmount: '0',
        allocatedOrderDiscount: '0',
        netAmount: '25000',
      }).success,
    ).toBe(accepted);
  });
});
