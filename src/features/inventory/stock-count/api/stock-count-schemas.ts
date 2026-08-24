import { z } from 'zod';
import { inventoryDateTimeSchema } from '../../api/inventory-rpc';

const nullableDateTime = inventoryDateTimeSchema.nullable();
const statusSchema = z.enum(['DRAFT', 'COUNTED', 'POSTED', 'CANCELLED']);
const stockCountLineSchema = z.object({
  id: z.uuid(),
  productId: z.uuid(),
  productName: z.string(),
  sku: z.string(),
  unitName: z.string(),
  systemQtySnapshot: z.string(),
  inventoryVersionSnapshot: z.number().int().nonnegative(),
  countedQty: z.string().nullable(),
  differenceQty: z.string().nullable(),
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
  nextCursor: z.null(),
});

export type PeriodicStockCount = z.infer<typeof stockCountSchema>;
