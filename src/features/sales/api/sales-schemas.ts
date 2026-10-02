import { z } from 'zod';
import { INTEGER_FINAL } from '@/shared/lib/numeric/canonical-number';

const quantitySchema = z.string().regex(INTEGER_FINAL);

export const saleLineSchema = z.object({
  id: z.uuid(),
  productId: z.uuid(),
  productName: z.string(),
  sku: z.string(),
  unitName: z.string(),
  quantity: quantitySchema,
  unitSalePrice: z.string(),
  grossAmount: z.string(),
  lineDiscountAmount: z.string(),
  allocatedOrderDiscount: z.string(),
  netAmount: z.string(),
  lineOrder: z.number().int(),
});

export const saleSchema = z.object({
  id: z.uuid(),
  saleNumber: z.string().nullable(),
  status: z.string(),
  customerId: z.uuid().nullable(),
  salesChannelId: z.uuid(),
  subtotal: z.string(),
  lineDiscountTotal: z.string(),
  orderDiscountTotal: z.string(),
  discountTotal: z.string(),
  netTotal: z.string(),
  note: z.string().nullable(),
  createdBy: z.uuid(),
  version: z.number().int(),
  createdAt: z.string(),
  updatedAt: z.string(),
  lines: z.array(saleLineSchema),
});

const invoiceLineSchema = saleLineSchema
  .omit({ lineOrder: true, productId: true })
  .extend({
    returnedQty: quantitySchema,
    returnableQty: quantitySchema,
  });

export const invoiceSchema = z.object({
  version: z.literal(2),
  store: z.object({
    displayName: z.string(),
    logoPath: z.string().nullable(),
    address: z.string().nullable(),
    contactPhone: z.string().nullable(),
    zalo: z.string().nullable(),
    invoiceFooter: z.string().nullable(),
  }),
  sale: z.object({
    id: z.uuid(),
    saleNumber: z.string(),
    completedAt: z.string(),
    status: z.string(),
    channelCode: z.string(),
    channelName: z.string(),
    staffName: z.string(),
    customerName: z.string().nullable(),
    customerPhone: z.string().nullable(),
    paymentMethod: z.enum(['CASH', 'BANK_TRANSFER']),
    paymentStatus: z.enum(['CAPTURED', 'REVERSED']),
    transferProofPath: z.string().nullable(),
    cancelledAt: z.string().nullable(),
    cancelReason: z.string().nullable(),
  }),
  lines: z.array(invoiceLineSchema),
  totals: z.object({
    subtotal: z.string(),
    lineDiscountTotal: z.string(),
    orderDiscountTotal: z.string(),
    netTotal: z.string(),
    capturedAmount: z.string(),
  }),
  lifecycle: z.object({
    canReturn: z.boolean(),
    canCancel: z.boolean(),
    returns: z.array(
      z.object({
        id: z.uuid(),
        returnNumber: z.string().nullable(),
        status: z.string(),
        reason: z.string(),
        refundTotal: z.string(),
        createdAt: z.string(),
        completedAt: z.string().nullable(),
        cancelReason: z.string().nullable(),
      }),
    ),
  }),
});

export const draftPrintSchema = z.object({
  version: z.literal(1),
  kind: z.literal('PROVISIONAL'),
  store: invoiceSchema.shape.store,
  draft: z.object({
    id: z.uuid(),
    status: z.literal('DRAFT'),
    version: z.number().int(),
    updatedAt: z.string(),
    channelName: z.string(),
    staffName: z.string(),
    customerName: z.string().nullable(),
    customerPhone: z.string().nullable(),
    note: z.string().nullable(),
  }),
  lines: z.array(saleLineSchema.omit({ productId: true, lineOrder: true })),
  totals: z.object({
    subtotal: z.string(),
    lineDiscountTotal: z.string(),
    orderDiscountTotal: z.string(),
    netTotal: z.string(),
  }),
});

export type DraftPrint = z.infer<typeof draftPrintSchema>;

export const saleListSchema = z.object({
  items: z.array(
    z.object({
      id: z.uuid(),
      saleNumber: z.string().nullable(),
      status: z.string(),
      customerName: z.string().nullable(),
      channelName: z.string(),
      netTotal: z.string(),
      createdByName: z.string(),
      completedAt: z.string().nullable(),
      sortAt: z.string(),
      version: z.number().int(),
    }),
  ),
  nextCursor: z.null(),
});

export type Sale = z.infer<typeof saleSchema>;
export type Invoice = z.infer<typeof invoiceSchema>;
export type CartLine = {
  productId: string;
  quantity: string;
  lineDiscountAmount: string;
  lineOrder: number;
};
