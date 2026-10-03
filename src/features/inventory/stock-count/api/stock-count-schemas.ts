import { z } from 'zod';
import { inventoryDateTimeSchema } from '../../api/inventory-rpc';
import {
  INTEGER_FINAL,
  SIGNED_INTEGER_FINAL,
} from '@/shared/lib/numeric/canonical-number';

const nullableDateTime = inventoryDateTimeSchema.nullable();
const statusSchema = z.enum(['DRAFT', 'COUNTED', 'POSTED', 'CANCELLED']);
const stockCountLineSchema = z.object({
  id: z.uuid(),
  productId: z.uuid(),
  productName: z.string(),
  sku: z.string(),
  unitName: z.string(),
  systemQtySnapshot: z.string().regex(INTEGER_FINAL),
  inventoryVersionSnapshot: z.number().int().nonnegative(),
  countedQty: z.string().regex(INTEGER_FINAL).nullable(),
  differenceQty: z.string().regex(SIGNED_INTEGER_FINAL).nullable(),
  lineOrder: z.number().int().nonnegative(),
  requiresEstimatedCost: z.boolean(),
});

export const stockCountSchema = z.object({
  id: z.uuid(),
  countNumber: z.string().nullable(),
  status: statusSchema,
  note: z.string().nullable(),
  version: z.number().int().positive(),
  createdByName: z.string(),
  createdAt: inventoryDateTimeSchema,
  submittedAt: nullableDateTime,
  postedAt: nullableDateTime,
  cancelReason: z.string().nullable(),
  canPost: z.boolean(),
  lines: z.array(stockCountLineSchema),
});

export const stockCountPageSchema = z.object({
  items: z.array(
    z.object({
      id: z.uuid(),
      countNumber: z.string().nullable(),
      status: statusSchema,
      createdByName: z.string(),
      lineCount: z.number().int().nonnegative(),
      createdAt: inventoryDateTimeSchema,
      submittedAt: nullableDateTime,
      postedAt: nullableDateTime,
      version: z.number().int().positive(),
      updatedAt: inventoryDateTimeSchema,
    }),
  ),
  nextCursor: z
    .object({ updatedAt: z.iso.datetime({ offset: true }), id: z.uuid() })
    .nullable(),
});

export type PeriodicStockCount = z.infer<typeof stockCountSchema>;
