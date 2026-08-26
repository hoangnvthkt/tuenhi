import { describe, expect, it } from 'vitest';
import { sanitizePersistedPosCartItems } from './pos-storage';

const validLine = {
  productId: '10000000-0000-4000-8000-000000000001',
  productName: 'Sản phẩm',
  sku: 'SP-001',
  unitName: 'Cái',
  quantity: '1000',
  unitSalePrice: '150000',
  lineDiscountAmount: '0',
  lineOrder: 0,
  onHandQty: '1000',
};

describe('sanitizePersistedPosCartItems', () => {
  it('keeps canonical integer quantities and drops old fractional quantities', () => {
    expect(
      sanitizePersistedPosCartItems([
        validLine,
        {
          ...validLine,
          productId: '10000000-0000-4000-8000-000000000002',
          quantity: '1.5',
        },
      ]),
    ).toEqual([validLine]);
  });
});
