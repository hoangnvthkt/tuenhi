import { z } from 'zod';
import { INTEGER_FINAL } from '@/shared/lib/numeric/canonical-number';
import {
  inventoryCursorSchema,
  inventoryDateTimeSchema,
  inventoryStatusSchema,
} from '../../api/inventory-rpc';

const nullableDateTime = inventoryDateTimeSchema.nullable();
const receiptListItemSchema = z.object({
  id: z.uuid(),
  receiptNumber: z.string().nullable(),
  status: inventoryStatusSchema,
  supplierId: z.uuid().nullable(),
  supplierName: z.string().nullable(),
  receivedAt: inventoryDateTimeSchema,
  createdByName: z.string(),
  lineCount: z.number().int().nonnegative(),
  totalQuantity: z.string().regex(INTEGER_FINAL),
  version: z.number().int().positive(),
  updatedAt: inventoryDateTimeSchema,
});

export const purchasePageSchema = z.object({
  items: z.array(receiptListItemSchema),
  nextCursor: inventoryCursorSchema.nullable(),
});

const receiptLineSchema = z.object({
  id: z.uuid(),
  productId: z.uuid(),
  productName: z.string(),
  sku: z.string(),
  unitName: z.string(),
  receivedQty: z.string().regex(INTEGER_FINAL),
  lineOrder: z.number().int().nonnegative(),
});

export const purchaseReceiptSchema = z.object({
  id: z.uuid(),
  receiptNumber: z.string().nullable(),
  status: inventoryStatusSchema,
  supplierId: z.uuid().nullable(),
  supplierName: z.string().nullable(),
  receivedAt: inventoryDateTimeSchema,
  note: z.string().nullable(),
  createdBy: z.uuid(),
  createdByName: z.string(),
  submittedByName: z.string().nullable(),
  postedByName: z.string().nullable(),
  reversedByName: z.string().nullable(),
  cancelledByName: z.string().nullable(),
  submittedAt: nullableDateTime,
  postedAt: nullableDateTime,
  reversedAt: nullableDateTime,
  cancelledAt: nullableDateTime,
  reverseReason: z.string().nullable(),
  cancelReason: z.string().nullable(),
  version: z.number().int().positive(),
  createdAt: inventoryDateTimeSchema,
  updatedAt: inventoryDateTimeSchema,
  lines: z.array(receiptLineSchema),
});

export const purchaseCostSchema = z.object({
  receiptId: z.uuid(),
  receiptNumber: z.string().nullable(),
  status: inventoryStatusSchema,
  totalCost: z.string(),
  lines: z.array(
    z.object({
      lineId: z.uuid(),
      unitCost: z.string().nullable(),
      lineCost: z.string().nullable(),
    }),
  ),
});

export type PurchaseReceipt = z.infer<typeof purchaseReceiptSchema>;
export type PurchaseReceiptCost = z.infer<typeof purchaseCostSchema>;
