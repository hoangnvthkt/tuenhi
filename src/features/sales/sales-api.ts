import { z } from 'zod';
import { getBusinessErrorMessage } from '../../lib/errors/command-error';
import { getSupabaseClient } from '../../lib/supabase/client';

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
const invoiceSchema = z.object({
  version: z.literal(1),
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
  }),
  lines: z.array(lineSchema.omit({ lineOrder: true })),
  totals: z.object({
    subtotal: z.string(),
    lineDiscountTotal: z.string(),
    orderDiscountTotal: z.string(),
    netTotal: z.string(),
    capturedAmount: z.string(),
  }),
});
const settingsSchema = z.object({
  displayName: z.string(),
  logoPath: z.string().nullable(),
  address: z.string().nullable(),
  contactPhone: z.string().nullable(),
  zalo: z.string().nullable(),
  invoiceFooter: z.string().nullable(),
  version: z.number().int(),
});
export type Sale = z.infer<typeof saleSchema>;
export type Invoice = z.infer<typeof invoiceSchema>;
export type StoreSettings = z.infer<typeof settingsSchema>;
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
    async getSettings() {
      return parse(settingsSchema, await rpc('get_store_settings', {}));
    },
    async saveSettings(
      expectedVersion: number,
      settings: Omit<StoreSettings, 'version'>,
      idempotencyKey: string,
    ) {
      return parse(
        z.object({ version: z.number().int() }),
        await rpc('save_store_settings', {
          p_expected_version: expectedVersion,
          p_settings: settings,
          p_idempotency_key: idempotencyKey,
        }),
      );
    },
  };
}
