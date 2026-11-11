import { INTEGER_FINAL } from '@/shared/lib/numeric/canonical-number';
import type { PosCartItem } from './pos-types';

type BundleLine = {
  productId: string;
  productName: string;
  sku: string;
  unitName: string;
  quantity: string;
  isActive: boolean;
  currentSalePrice: string | null;
  onHandQty: string;
  primaryImagePath?: string | null;
};

/** Adds every sellable item of a bundle at its current price; cart lines stay one per product. */
export function addBundleToCart(cart: PosCartItem[], lines: BundleLine[]) {
  const items = [...cart];
  const skipped: string[] = [];
  for (const line of lines) {
    if (!line.isActive || !line.currentSalePrice) {
      skipped.push(line.productName);
      continue;
    }
    const index = items.findIndex((x) => x.productId === line.productId);
    if (index >= 0) {
      const found = items[index]!;
      const current = INTEGER_FINAL.test(found.quantity)
        ? BigInt(found.quantity)
        : 0n;
      items[index] = {
        ...found,
        quantity: (current + BigInt(line.quantity)).toString(),
      };
    } else {
      items.push({
        productId: line.productId,
        productName: line.productName,
        sku: line.sku,
        unitName: line.unitName,
        quantity: line.quantity,
        unitSalePrice: line.currentSalePrice,
        lineDiscountAmount: '0',
        lineOrder: items.length,
        onHandQty: line.onHandQty,
        primaryImagePath: line.primaryImagePath,
      });
    }
  }
  return { items, skipped };
}
