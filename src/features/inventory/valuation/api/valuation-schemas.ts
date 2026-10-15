import { z } from 'zod';
import { SIGNED_INTEGER_FINAL } from '@/shared/lib/numeric/canonical-number';

export const valuationPageSchema = z.object({
  version: z.literal(2),
  items: z.array(
    z.object({
      productId: z.uuid(),
      sku: z.string(),
      name: z.string(),
      unitName: z.string(),
      onHandQty: z.string().regex(SIGNED_INTEGER_FINAL),
      avgUnitCost: z.string(),
      inventoryValue: z.string(),
    }),
  ),
  nextCursor: z.object({ name: z.string(), id: z.uuid() }).nullable(),
  totalInventoryValue: z.string(),
});

export type ValuationPage = z.infer<typeof valuationPageSchema>;
