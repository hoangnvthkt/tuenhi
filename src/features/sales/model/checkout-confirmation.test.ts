import { describe, expect, it } from 'vitest';
import type { Sale } from '../api/sales-schemas';
import {
  hasCheckoutChanged,
  type CheckoutSnapshot,
} from './checkout-confirmation';
const confirmed: CheckoutSnapshot = {
  customerId: null,
  channelId: 'channel',
  orderDiscount: '0',
  netTotal: '200000',
  lines: [
    {
      productId: 'a',
      quantity: '1',
      unitSalePrice: '100000',
      lineDiscountAmount: '0',
    },
    {
      productId: 'b',
      quantity: '1',
      unitSalePrice: '100000',
      lineDiscountAmount: '0',
    },
  ],
};
const sale: Sale = {
  id: 'sale',
  saleNumber: null,
  status: 'DRAFT',
  customerId: null,
  salesChannelId: 'channel',
  subtotal: '200000',
  lineDiscountTotal: '0',
  orderDiscountTotal: '0',
  discountTotal: '0',
  netTotal: '200000',
  note: null,
  createdBy: 'owner',
  version: 2,
  createdAt: '2026-10-03T00:00:00Z',
  updatedAt: '2026-10-03T00:00:00Z',
  lines: confirmed.lines.map((line, i) => ({
    ...line,
    id: `line-${i}`,
    productName: line.productId,
    sku: line.productId,
    unitName: 'Hộp',
    grossAmount: '100000',
    allocatedOrderDiscount: '0',
    netAmount: '100000',
    lineOrder: i,
  })),
};
describe('checkout confirmation', () => {
  it('detects changed line prices even if the final total is unchanged', () => {
    expect(
      hasCheckoutChanged(confirmed, {
        ...sale,
        lines: sale.lines.map((line, i) => ({
          ...line,
          unitSalePrice: i ? '80000' : '120000',
        })),
      }),
    ).toBe(true);
  });
  it.each([
    { customerId: 'new-customer' },
    { salesChannelId: 'other-channel' },
    { orderDiscountTotal: '100' },
    { netTotal: '199999' },
    { lines: sale.lines.slice(1) },
    {
      lines: sale.lines.map((line) => ({
        ...line,
        productId: 'other-product',
      })),
    },
    { lines: sale.lines.map((line) => ({ ...line, quantity: '2' })) },
    {
      lines: sale.lines.map((line) => ({ ...line, lineDiscountAmount: '10' })),
    },
  ])('detects changes to the confirmed content %j', (patch) =>
    expect(hasCheckoutChanged(confirmed, { ...sale, ...patch })).toBe(true),
  );
  it('compares numeric values and allows server line ordering', () => {
    expect(
      hasCheckoutChanged(confirmed, {
        ...sale,
        netTotal: '200000.00',
        orderDiscountTotal: '0.00',
        lines: sale.lines.toReversed().map((line) => ({
          ...line,
          unitSalePrice: '100000.00',
          lineDiscountAmount: '0.00',
        })),
      }),
    ).toBe(false);
  });
});
