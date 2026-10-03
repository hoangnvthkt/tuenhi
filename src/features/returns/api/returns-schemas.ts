import { z } from 'zod';
import { INTEGER_FINAL } from '@/shared/lib/numeric/canonical-number';

const quantitySchema = z.string().regex(INTEGER_FINAL);

export const returnLookupSchema = z.object({
  saleId: z.uuid(),
  saleNumber: z.string(),
  completedAt: z.string(),
  customerName: z.string().nullable(),
  lines: z.array(
    z.object({
      id: z.uuid(),
      productId: z.uuid(),
      productName: z.string(),
      sku: z.string(),
      unitName: z.string(),
      soldQty: quantitySchema,
      returnedQty: quantitySchema,
      returnableQty: quantitySchema,
      netAmount: z.string(),
    }),
  ),
});

const returnLineSchema = z.object({
  id: z.uuid(),
  originalSaleLineId: z.uuid(),
  productId: z.uuid(),
  productName: z.string(),
  sku: z.string(),
  unitName: z.string(),
  requestedQty: quantitySchema,
  acceptedQty: quantitySchema.nullable(),
  refundAmount: z.string(),
  soldQty: quantitySchema,
  returnedQtyBefore: quantitySchema,
});

export const saleReturnSchema = z.object({
  id: z.uuid(),
  returnNumber: z.string().nullable(),
  saleId: z.uuid(),
  saleNumber: z.string(),
  status: z.string(),
  reason: z.string(),
  refundTotal: z.string(),
  version: z.number().int(),
  createdByName: z.string(),
  createdAt: z.string(),
  completedAt: z.string().nullable(),
  cancelReason: z.string().nullable(),
  canComplete: z.boolean(),
  refundMethod: z.enum(['CASH', 'BANK_TRANSFER']).nullable(),
  transferProofPath: z.string().nullable(),
  lines: z.array(returnLineSchema),
});

export const returnPageSchema = z.object({
  items: z.array(
    z.object({
      id: z.uuid(),
      returnNumber: z.string().nullable(),
      status: z.string(),
      saleId: z.uuid(),
      saleNumber: z.string(),
      reason: z.string(),
      refundTotal: z.string(),
      createdByName: z.string(),
      createdAt: z.string(),
      completedAt: z.string().nullable(),
      version: z.number().int(),
      updatedAt: z.string(),
    }),
  ),
  nextCursor: z
    .object({ updatedAt: z.iso.datetime({ offset: true }), id: z.uuid() })
    .nullable(),
});

export type ReturnLookup = z.infer<typeof returnLookupSchema>;
export type SaleReturn = z.infer<typeof saleReturnSchema>;
