import { validateCanonicalNumber } from '@/shared/lib/numeric/canonical-number';
import type { PurchaseDraftLine } from './purchase-draft';

export function validatePurchaseDraftLines(lines: PurchaseDraftLine[]): {
  ok: boolean;
  lines: PurchaseDraftLine[];
} {
  const productIds = new Set<string>();
  const allValid =
    lines.length > 0 &&
    lines.every((line) => {
      const productIsUnique =
        Boolean(line.productId) && !productIds.has(line.productId);
      if (line.productId) productIds.add(line.productId);
      return (
        productIsUnique &&
        validateCanonicalNumber(line.receivedQty, {
          kind: 'quantity',
          precision: 18,
          positive: true,
        }).ok &&
        validateCanonicalNumber(line.unitCost, {
          kind: 'money',
          precision: 20,
          positive: true,
        }).ok
      );
    });
  return { ok: allValid, lines: allValid ? lines : [] };
}
