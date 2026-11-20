import { describe, expect, it } from 'vitest';
import {
  calculatePosTotals,
  discountFromPercent,
  lineNetAmount,
  withLineQuantity,
  withUnitDiscount,
} from './pos-totals';

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
      itemsTotal: '150000499.5',
      discountTotal: '10.75',
      total: '150000489.25',
    });
  });

  it('converts a percent discount to whole dong, capped at the base', () => {
    expect(discountFromPercent('110000', '10')).toBe('11000');
    expect(discountFromPercent('56000', '12.5')).toBe('7000');
    expect(discountFromPercent('1999', '50')).toBe('1000');
    expect(discountFromPercent('100.5', '100')).toBe('100.5');
    expect(discountFromPercent('56000', '150')).toBe('56000');
    expect(discountFromPercent('56000', '')).toBe('0');
  });

  it('computes the line amount after its discount', () => {
    expect(
      lineNetAmount({
        quantity: '2',
        unitSalePrice: '56000',
        lineDiscountAmount: '1000',
      }),
    ).toBe('111000');
  });
});

describe('per-unit line discount', () => {
  const line = {
    quantity: '1',
    unitSalePrice: '10000',
    lineDiscountAmount: '0',
  };

  it('multiplies one unit discount by the quantity', () => {
    const discounted = withUnitDiscount(line, '2000');
    expect(withLineQuantity(discounted, '10')).toMatchObject({
      lineDiscountAmount: '20000',
      unitDiscountAmount: '2000',
    });
    expect(lineNetAmount(withLineQuantity(discounted, '10'))).toBe('80000');
  });

  it('keeps the unit discount while the quantity is being retyped', () => {
    const typing = withLineQuantity(withUnitDiscount(line, '2000'), '');
    expect(typing.lineDiscountAmount).toBe('0');
    expect(withLineQuantity(typing, '3').lineDiscountAmount).toBe('6000');
  });

  it('derives the unit discount of a saved line and leaves uneven totals alone', () => {
    const saved = {
      quantity: '2',
      unitSalePrice: '10000',
      lineDiscountAmount: '4000',
    };
    expect(withLineQuantity(saved, '5').lineDiscountAmount).toBe('10000');
    const uneven = { ...saved, quantity: '3', lineDiscountAmount: '1000' };
    expect(withLineQuantity(uneven, '5').lineDiscountAmount).toBe('1000');
  });
});
