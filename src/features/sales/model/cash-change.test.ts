import { describe, expect, it } from 'vitest';
import { calculateCashChange } from './cash-change';
describe('cash change', () => {
  it.each([
    ['274000', '300000', 'SUFFICIENT', '26000', null],
    ['274000', '200000', 'INSUFFICIENT', null, '74000'],
    ['274000', '', 'EMPTY', null, null],
    ['274000', '-1', 'INVALID', null, null],
    ['274000', '300000.', 'INVALID', null, null],
    ['274000', '300,000', 'INVALID', null, null],
    ['9007199254740993.01', '9007199254740994.02', 'SUFFICIENT', '1.01', null],
    ['0', '0', 'SUFFICIENT', '0', null],
  ])('%s paid with %s', (total, tendered, status, change, shortfall) => {
    expect(calculateCashChange(total, tendered)).toEqual({
      status,
      change,
      shortfall,
    });
  });
});
