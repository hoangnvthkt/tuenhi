import { expect, it } from 'vitest';
import { addBundleToCart } from './pos-bundle';

const line = (productId: string, quantity: string, price: string | null) => ({
  productId,
  productName: productId,
  sku: productId,
  unitName: 'Hộp',
  quantity,
  isActive: true,
  currentSalePrice: price,
  onHandQty: '5',
});

it('adds each item at its current price and merges items already in the cart', () => {
  const first = addBundleToCart([], [line('a', '2', '10000')]);
  const { items, skipped } = addBundleToCart(first.items, [
    line('a', '1', '10000'),
    line('b', '3', '25000'),
  ]);
  expect(skipped).toEqual([]);
  expect(items.map((x) => [x.productId, x.quantity, x.unitSalePrice])).toEqual([
    ['a', '3', '10000'],
    ['b', '3', '25000'],
  ]);
  expect(items.map((x) => x.lineDiscountAmount)).toEqual(['0', '0']);
});

it('skips discontinued or unpriced items and names them', () => {
  const { items, skipped } = addBundleToCart(
    [],
    [
      line('a', '1', null),
      { ...line('b', '1', '5000'), isActive: false },
      line('c', '1', '7000'),
    ],
  );
  expect(items.map((x) => x.productId)).toEqual(['c']);
  expect(skipped).toEqual(['a', 'b']);
});
