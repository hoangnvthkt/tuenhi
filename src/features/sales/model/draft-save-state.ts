import { MONEY_FINAL } from '@/shared/lib/numeric/canonical-number';
type Line = {
  productId: string;
  quantity: string;
  lineDiscountAmount: string;
  unitSalePrice: string;
};
type Current = {
  items: Line[];
  customerId: string;
  channelId: string;
  orderDiscount: string;
  note: string;
};
type Saved = {
  lines: Line[];
  customerId: string | null;
  salesChannelId: string;
  orderDiscountTotal: string;
  note: string | null;
};
function money(value: string) {
  if (!MONEY_FINAL.test(value)) return value;
  const [whole, decimal = ''] = value.split('.');
  return (BigInt(whole!) * 100n + BigInt(decimal.padEnd(2, '0'))).toString();
}
export function isDraftDirty(saved: Saved | null, current: Current): boolean {
  if (!saved) return true;
  const lines = (items: Line[]) =>
    items.map((i) => [
      i.productId,
      i.quantity,
      money(i.lineDiscountAmount),
      money(i.unitSalePrice),
    ]);
  return (
    JSON.stringify([
      saved.customerId ?? '',
      saved.salesChannelId,
      money(saved.orderDiscountTotal),
      saved.note ?? '',
      lines(saved.lines),
    ]) !==
    JSON.stringify([
      current.customerId,
      current.channelId,
      money(current.orderDiscount),
      current.note,
      lines(current.items),
    ])
  );
}
