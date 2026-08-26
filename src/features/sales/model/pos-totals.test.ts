import { describe, expect, it } from 'vitest';
import { calculatePosTotals } from './pos-totals';

describe('calculatePosTotals', () => {
  it('multiplies an integer quantity without converting it to Number', () => {
    expect(
      calculatePosTotals(
        [
          {
            quantity: '1000',
            unitSalePrice: '150000.50',
            lineDiscountAmount: '0.50',
          },
        ],
        '10.25',
      ),
    ).toEqual({
      subtotal: '150000500',
      lineDiscount: '0.5',
      discountTotal: '10.75',
      total: '150000489.25',
    });
  });
});
