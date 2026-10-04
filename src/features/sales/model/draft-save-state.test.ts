import { expect, it } from 'vitest';
import { isDraftDirty } from './draft-save-state';
const current = {
  customerId: '',
  channelId: 'c',
  orderDiscount: '0',
  note: '',
  items: [
    {
      productId: 'p',
      quantity: '2',
      lineDiscountAmount: '0',
      unitSalePrice: '50',
    },
  ],
};
const draft = {
  customerId: null,
  salesChannelId: 'c',
  orderDiscountTotal: '0.00',
  note: null,
  lines: [
    {
      productId: 'p',
      quantity: '2',
      lineDiscountAmount: '0.00',
      unitSalePrice: '50.00',
    },
  ],
};
it('compares actual editable values and canonical money against the saved snapshot', () => {
  expect(isDraftDirty(null, current)).toBe(true);
  expect(isDraftDirty(draft, current)).toBe(false);
  for (const changed of [
    { note: 'abc' },
    { customerId: 'new' },
    { channelId: 'other' },
    { orderDiscount: '1' },
    { items: [{ ...current.items[0]!, quantity: '3' }] },
    { items: [{ ...current.items[0]!, unitSalePrice: '51' }] },
  ])
    expect(isDraftDirty(draft, { ...current, ...changed })).toBe(true);
});
