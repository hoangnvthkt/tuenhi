import { z } from 'zod';

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
      soldQty: z.string(),
      returnedQty: z.string(),
      returnableQty: z.string(),
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
  requestedQty: z.string(),
  acceptedQty: z.string().nullable(),
  refundAmount: z.string(),
  soldQty: z.string(),
  returnedQtyBefore: z.string(),
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
  nextCursor: z.null(),
});

export type ReturnLookup = z.infer<typeof returnLookupSchema>;
export type SaleReturn = z.infer<typeof saleReturnSchema>;
