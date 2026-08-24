import { z } from 'zod';
import { getBusinessErrorMessage } from '@/shared/api/command-error';
import { getSupabaseClient } from '@/shared/supabase/client';

const errorSchema = z.object({
  code: z.string(),
  message: z.string(),
  details: z.record(z.string(), z.unknown()),
});
function envelope<T extends z.ZodType>(data: T) {
  return z.discriminatedUnion('ok', [
    z.object({
      ok: z.literal(true),
      data,
      error: z.null(),
      correlationId: z.uuid(),
    }),
    z.object({
      ok: z.literal(false),
      data: z.null(),
      error: errorSchema,
      correlationId: z.uuid(),
    }),
  ]);
}
export class SalesApiError extends Error {
  constructor(
    readonly code: string,
    readonly correlationId: string,
    readonly details: Record<string, unknown>,
  ) {
    super(getBusinessErrorMessage(code));
    this.name = 'SalesApiError';
  }
}
function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const item = envelope(schema).safeParse(value);
  if (!item.success)
    throw new Error('Phản hồi bán hàng từ máy chủ không hợp lệ.');
  if (!item.data.ok)
    throw new SalesApiError(
      item.data.error.code,
      item.data.correlationId,
      item.data.error.details,
    );
  return item.data.data;
}
const lineSchema = z.object({
  id: z.uuid(),
  productId: z.uuid(),
  productName: z.string(),
  sku: z.string(),
  unitName: z.string(),
  quantity: z.string(),
  unitSalePrice: z.string(),
  grossAmount: z.string(),
  lineDiscountAmount: z.string(),
  allocatedOrderDiscount: z.string(),
  netAmount: z.string(),
  lineOrder: z.number().int(),
});
const saleSchema = z.object({
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
  lines: z.array(lineSchema),
});
const invoiceLineSchema = lineSchema
  .omit({ lineOrder: true, productId: true })
  .extend({
    returnedQty: z.string(),
    returnableQty: z.string(),
  });
const invoiceSchema = z.object({
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
const returnLookupSchema = z.object({
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
const saleReturnSchema = z.object({
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
  lines: z.array(returnLineSchema),
});
const returnPageSchema = z.object({
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
export type Sale = z.infer<typeof saleSchema>;
export type Invoice = z.infer<typeof invoiceSchema>;
export type ReturnLookup = z.infer<typeof returnLookupSchema>;
export type SaleReturn = z.infer<typeof saleReturnSchema>;
export type CartLine = {
  productId: string;
  quantity: string;
  lineDiscountAmount: string;
  lineOrder: number;
};
function rpcError() {
  return new Error(
    'Không thể kết nối máy chủ. Kết quả thao tác có thể chưa xác định.',
  );
}
export function createSalesApi() {
  const client = getSupabaseClient();
  const rpc = async (
    name: Parameters<typeof client.rpc>[0],
    args: Record<string, unknown>,
  ) => {
    const { data, error } = await client.rpc(name, args as never);
    if (error) throw rpcError();
    return data;
  };
  return {
    async saveDraft(input: {
      saleId?: string;
      expectedVersion?: number;
      customerId?: string;
      channelId: string;
      lines: CartLine[];
      orderDiscount: string;
      note: string;
      idempotencyKey: string;
    }) {
      return parse(
        z.object({ sale: saleSchema, priceRefreshed: z.boolean() }),
        await rpc('save_sale_draft', {
          p_sale_id: input.saleId ?? null,
          p_expected_version: input.expectedVersion ?? null,
          p_customer_id: input.customerId ?? null,
          p_sales_channel_id: input.channelId,
          p_lines: input.lines,
          p_order_discount: input.orderDiscount,
          p_note: input.note,
          p_idempotency_key: input.idempotencyKey,
        }),
      );
    },
    async discardDraft(
      saleId: string,
      expectedVersion: number,
      idempotencyKey: string,
    ) {
      return parse(
        z.object({ saleId: z.uuid(), discarded: z.literal(true) }),
        await rpc('discard_sale_draft', {
          p_sale_id: saleId,
          p_expected_version: expectedVersion,
          p_idempotency_key: idempotencyKey,
        }),
      );
    },
    async complete(
      saleId: string,
      expectedVersion: number,
      method: 'CASH' | 'BANK_TRANSFER',
      idempotencyKey: string,
    ) {
      return parse(
        z.object({
          saleId: z.uuid(),
          saleNumber: z.string(),
          status: z.literal('COMPLETED'),
          version: z.number().int(),
        }),
        await rpc('complete_sale', {
          p_sale_id: saleId,
          p_expected_version: expectedVersion,
          p_payment_method: method,
          p_idempotency_key: idempotencyKey,
        }),
      );
    },
    async detail(saleId: string) {
      return parse(
        saleSchema,
        await rpc('get_sale_detail', { p_sale_id: saleId }),
      );
    },
    async list(filters: { status?: string; search?: string } = {}) {
      return parse(
        z.object({
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
        }),
        await rpc('list_sales', {
          p_filters: filters,
          p_cursor_sort_at: null,
          p_cursor_id: null,
          p_limit: 50,
        }),
      );
    },
    async invoice(saleId: string) {
      return parse(
        invoiceSchema,
        await rpc('get_sale_invoice', { p_sale_id: saleId }),
      );
    },
    async lookupReturnInvoice(fullSaleNumber: string) {
      return parse(
        returnLookupSchema,
        await rpc('lookup_sale_for_return', {
          p_full_sale_number: fullSaleNumber,
        }),
      );
    },
    async createReturn(input: {
      saleId: string;
      reason: string;
      lines: Array<{ originalSaleLineId: string; requestedQty: string }>;
      idempotencyKey: string;
    }) {
      return parse(
        z.object({
          returnId: z.uuid(),
          status: z.literal('REQUESTED'),
          version: z.number().int(),
        }),
        await rpc('create_sale_return_request', {
          p_original_sale_id: input.saleId,
          p_reason: input.reason,
          p_lines: input.lines,
          p_idempotency_key: input.idempotencyKey,
        }),
      );
    },
    async listReturns(filters: { status?: string; search?: string } = {}) {
      return parse(
        returnPageSchema,
        await rpc('list_sale_returns', {
          p_filters: filters,
          p_cursor_updated_at: null,
          p_cursor_id: null,
          p_limit: 50,
        }),
      );
    },
    async getReturn(returnId: string) {
      return parse(
        saleReturnSchema,
        await rpc('get_sale_return', { p_return_id: returnId }),
      );
    },
    async cancelReturn(
      returnId: string,
      expectedVersion: number,
      reason: string,
      idempotencyKey: string,
    ) {
      return parse(
        z.object({
          returnId: z.uuid(),
          status: z.literal('CANCELLED'),
          version: z.number().int(),
        }),
        await rpc('cancel_sale_return', {
          p_return_id: returnId,
          p_expected_version: expectedVersion,
          p_reason: reason,
          p_idempotency_key: idempotencyKey,
        }),
      );
    },
    async completeReturn(input: {
      returnId: string;
      expectedVersion: number;
      lines: Array<{ saleReturnLineId: string; acceptedQty: string }>;
      refundMethod: 'CASH' | 'BANK_TRANSFER';
      idempotencyKey: string;
    }) {
      return parse(
        z.object({
          returnId: z.uuid(),
          returnNumber: z.string(),
          status: z.literal('COMPLETED'),
          refundTotal: z.string(),
          version: z.number().int(),
        }),
        await rpc('complete_sale_return', {
          p_return_id: input.returnId,
          p_expected_version: input.expectedVersion,
          p_lines: input.lines,
          p_refund_method: input.refundMethod,
          p_idempotency_key: input.idempotencyKey,
        }),
      );
    },
    async cancelSale(
      saleId: string,
      expectedVersion: number,
      reason: string,
      idempotencyKey: string,
    ) {
      return parse(
        z.object({
          saleId: z.uuid(),
          status: z.literal('CANCELLED'),
          version: z.number().int(),
        }),
        await rpc('cancel_sale', {
          p_sale_id: saleId,
          p_expected_version: expectedVersion,
          p_reason: reason,
          p_idempotency_key: idempotencyKey,
        }),
      );
    },
  };
}
