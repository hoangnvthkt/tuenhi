import {
  MONEY_FINAL,
  INTEGER_FINAL,
} from '@/shared/lib/numeric/canonical-number';
import type { Sale } from '../api/sales-schemas';
export type CheckoutSnapshot = {
  customerId: string | null;
  channelId: string;
  orderDiscount: string;
  netTotal: string;
  lines: {
    productId: string;
    quantity: string;
    unitSalePrice: string;
    lineDiscountAmount: string;
  }[];
};

function sameMoney(a: string, b: string) {
  if (!MONEY_FINAL.test(a) || !MONEY_FINAL.test(b)) return false;
  const minor = (value: string) => {
    const [integer = '0', fraction = ''] = value.split('.');
    return BigInt(integer) * 100n + BigInt(fraction.padEnd(2, '0'));
  };
  return minor(a) === minor(b);
}

export function hasCheckoutChanged(
  confirmed: CheckoutSnapshot,
  saved: Sale,
): boolean {
  if (
    confirmed.customerId !== saved.customerId ||
    confirmed.channelId !== saved.salesChannelId ||
    !sameMoney(confirmed.orderDiscount, saved.orderDiscountTotal) ||
    !sameMoney(confirmed.netTotal, saved.netTotal) ||
    confirmed.lines.length !== saved.lines.length
  )
    return true;
  const savedLines = new Map(saved.lines.map((line) => [line.productId, line]));
  if (
    savedLines.size !== confirmed.lines.length ||
    new Set(confirmed.lines.map((line) => line.productId)).size !==
      confirmed.lines.length
  )
    return true;
  return confirmed.lines.some((line) => {
    const next = savedLines.get(line.productId);
    return (
      !next ||
      !INTEGER_FINAL.test(line.quantity) ||
      !INTEGER_FINAL.test(next.quantity) ||
      line.quantity !== next.quantity ||
      !sameMoney(line.unitSalePrice, next.unitSalePrice) ||
      !sameMoney(line.lineDiscountAmount, next.lineDiscountAmount)
    );
  });
}
