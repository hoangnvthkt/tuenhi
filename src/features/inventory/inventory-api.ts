import { z } from 'zod';
import { getBusinessErrorMessage } from '../../lib/errors/command-error';
import { getSupabaseClient } from '../../lib/supabase/client';
import type { Json } from '../../lib/supabase/database.types';

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

export class InventoryApiError extends Error {
  constructor(
    readonly code: string,
    readonly correlationId: string,
    readonly details: Record<string, unknown>,
  ) {
    super(getBusinessErrorMessage(code));
    this.name = 'InventoryApiError';
  }
}

function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = envelope(schema).safeParse(value);
  if (!result.success) throw new Error('Phản hồi kho từ máy chủ không hợp lệ.');
  if (!result.data.ok) {
    throw new InventoryApiError(
      result.data.error.code,
      result.data.correlationId,
      result.data.error.details,
    );
  }
  return result.data.data;
}

const statusSchema = z.enum([
  'DRAFT',
  'AWAITING_COST',
  'COUNTED',
  'POSTED',
  'REVERSED',
  'CANCELLED',
]);
const dateTime = z.iso.datetime({ offset: true });
const nullableDateTime = dateTime.nullable();

const receiptListItemSchema = z.object({
  id: z.uuid(),
  receiptNumber: z.string().nullable(),
  status: statusSchema,
  supplierId: z.uuid().nullable(),
  supplierName: z.string().nullable(),
  receivedAt: dateTime,
  createdByName: z.string(),
  lineCount: z.number().int().nonnegative(),
  totalQuantity: z.string(),
  version: z.number().int().positive(),
  updatedAt: dateTime,
});
const cursorSchema = z.object({ updatedAt: dateTime, id: z.uuid() });
const receiptPageSchema = z.object({
  items: z.array(receiptListItemSchema),
  nextCursor: cursorSchema.nullable(),
});

const receiptLineSchema = z.object({
  id: z.uuid(),
  productId: z.uuid(),
  productName: z.string(),
  sku: z.string(),
  unitName: z.string(),
  receivedQty: z.string(),
  lineOrder: z.number().int().nonnegative(),
});
const receiptSchema = z.object({
  id: z.uuid(),
  receiptNumber: z.string().nullable(),
  status: statusSchema,
  supplierId: z.uuid().nullable(),
  supplierName: z.string().nullable(),
  receivedAt: dateTime,
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
  createdAt: dateTime,
  updatedAt: dateTime,
  lines: z.array(receiptLineSchema),
});
const costDetailSchema = z.object({
  receiptId: z.uuid(),
  receiptNumber: z.string().nullable(),
  status: statusSchema,
  totalCost: z.string(),
  lines: z.array(
    z.object({
      lineId: z.uuid(),
      unitCost: z.string().nullable(),
      lineCost: z.string().nullable(),
    }),
  ),
});

const openingLineSchema = z.object({
  id: z.uuid(),
  productId: z.uuid(),
  productName: z.string(),
  sku: z.string(),
  unitName: z.string(),
  systemQtySnapshot: z.string(),
  inventoryVersionSnapshot: z.number().int().nonnegative(),
  countedQty: z.string(),
  openingUnitCost: z.string(),
  openingValue: z.string(),
  sourceSuggestionId: z.uuid().nullable(),
  unverifiedSourceConfirmed: z.boolean(),
  lineOrder: z.number().int().nonnegative(),
});
const openingDocumentSchema = z.object({
  id: z.uuid(),
  countNumber: z.string().nullable(),
  countType: z.literal('OPENING'),
  status: statusSchema,
  note: z.string().nullable(),
  version: z.number().int().positive(),
  createdByName: z.string(),
  submittedByName: z.string().nullable(),
  postedByName: z.string().nullable(),
  cancelledByName: z.string().nullable(),
  submittedAt: nullableDateTime,
  postedAt: nullableDateTime,
  cancelledAt: nullableDateTime,
  cancelReason: z.string().nullable(),
  createdAt: dateTime,
  updatedAt: dateTime,
  totalValue: z.string(),
  lines: z.array(openingLineSchema),
});
const openingPageSchema = z.object({
  items: z.array(
    z.object({
      id: z.uuid(),
      countNumber: z.string().nullable(),
      status: statusSchema,
      createdByName: z.string(),
      lineCount: z.number().int().nonnegative(),
      totalQuantity: z.string(),
      totalValue: z.string(),
      version: z.number().int().positive(),
      updatedAt: dateTime,
    }),
  ),
  nextCursor: cursorSchema.nullable(),
});
const suggestionPageSchema = z.object({
  items: z.array(
    z.object({
      id: z.uuid(),
      sourceImportRunId: z.uuid(),
      sourceRowNumber: z.number().int(),
      productCode: z.string().nullable(),
      productId: z.uuid(),
      productName: z.string(),
      sku: z.string(),
      suggestedUnitCost: z.string().nullable(),
      suggestedOpeningQuantity: z.string().nullable(),
      warningCodes: z.array(z.string()),
      requiresConfirmation: z.literal(true),
    }),
  ),
  nextCursorId: z.uuid().nullable(),
});
const valuationPageSchema = z.object({
  items: z.array(
    z.object({
      productId: z.uuid(),
      sku: z.string(),
      name: z.string(),
      unitName: z.string(),
      onHandQty: z.string(),
      avgUnitCost: z.string(),
      inventoryValue: z.string(),
    }),
  ),
  nextCursor: z.object({ name: z.string(), id: z.uuid() }).nullable(),
  totalInventoryValue: z.string(),
});
const periodicCountLineSchema = z.object({
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
const periodicCountSchema = z.object({
  id: z.uuid(),
  countNumber: z.string().nullable(),
  status: z.enum(['DRAFT', 'COUNTED', 'POSTED', 'CANCELLED']),
  note: z.string().nullable(),
  version: z.number().int().positive(),
  createdByName: z.string(),
  createdAt: dateTime,
  submittedAt: nullableDateTime,
  postedAt: nullableDateTime,
  cancelReason: z.string().nullable(),
  canPost: z.boolean(),
  lines: z.array(periodicCountLineSchema),
});
const periodicCountPageSchema = z.object({
  items: z.array(
    z.object({
      id: z.uuid(),
      countNumber: z.string().nullable(),
      status: z.enum(['DRAFT', 'COUNTED', 'POSTED', 'CANCELLED']),
      createdByName: z.string(),
      lineCount: z.number().int().nonnegative(),
      createdAt: dateTime,
      submittedAt: nullableDateTime,
      postedAt: nullableDateTime,
      version: z.number().int().positive(),
      updatedAt: dateTime,
    }),
  ),
  nextCursor: z.null(),
});

const mutationSchema = z.record(z.string(), z.unknown());
export type PurchaseReceipt = z.infer<typeof receiptSchema>;
export type PurchaseReceiptCost = z.infer<typeof costDetailSchema>;
export type OpeningDocument = z.infer<typeof openingDocumentSchema>;
export type OpeningSuggestion = z.infer<
  typeof suggestionPageSchema
>['items'][number];
export type ValuationPage = z.infer<typeof valuationPageSchema>;
export type PeriodicStockCount = z.infer<typeof periodicCountSchema>;

function nullable<T>(value: T | undefined): T {
  return (value ?? null) as T;
}

export function createInventoryApi() {
  const client = getSupabaseClient();
  const rpc = async (name: Parameters<typeof client.rpc>[0], args: Json) => {
    const { data, error } = await client.rpc(name, args as never);
    if (error)
      throw new Error(
        'Không thể kết nối máy chủ. Kết quả thao tác có thể chưa xác định.',
      );
    return data;
  };
  return {
    async listPurchases(status?: string) {
      return parse(
        receiptPageSchema,
        await rpc('list_purchase_receipts', {
          p_filters: status ? { status } : {},
          p_cursor_updated_at: null,
          p_cursor_id: null,
          p_limit: 100,
        }),
      );
    },
    async getPurchase(id: string) {
      return parse(
        receiptSchema,
        await rpc('get_purchase_receipt_operational', { p_receipt_id: id }),
      );
    },
    async getPurchaseCost(id: string) {
      return parse(
        costDetailSchema,
        await rpc('get_purchase_receipt_cost_detail', { p_receipt_id: id }),
      );
    },
    async savePurchase(input: {
      id?: string;
      expectedVersion?: number;
      supplierId?: string;
      receivedAt: string;
      note: string;
      lines: Array<{ productId: string; receivedQty: string }>;
      idempotencyKey: string;
    }) {
      return parse(
        mutationSchema,
        await rpc('save_purchase_receipt_draft', {
          p_receipt_id: nullable(input.id),
          p_expected_version: nullable(input.expectedVersion),
          p_supplier_id: nullable(input.supplierId),
          p_received_at: input.receivedAt,
          p_note: input.note || null,
          p_lines: input.lines,
          p_idempotency_key: input.idempotencyKey,
        }),
      );
    },
    async commandPurchase(
      command: 'submit' | 'cancel' | 'reverse',
      id: string,
      version: number,
      reason = '',
    ) {
      const names = {
        submit: 'submit_purchase_receipt',
        cancel: 'cancel_purchase_receipt',
        reverse: 'reverse_purchase_receipt',
      } as const;
      const args =
        command === 'submit'
          ? {
              p_receipt_id: id,
              p_expected_version: version,
              p_idempotency_key: crypto.randomUUID(),
            }
          : command === 'cancel'
            ? {
                p_receipt_id: id,
                p_expected_version: version,
                p_reason: reason,
                p_idempotency_key: crypto.randomUUID(),
              }
            : {
                p_receipt_id: id,
                p_reason: reason,
                p_idempotency_key: crypto.randomUUID(),
              };
      return parse(mutationSchema, await rpc(names[command], args));
    },
    async postPurchase(
      id: string,
      version: number,
      costs: Array<{ lineId: string; unitCost: string }>,
    ) {
      return parse(
        mutationSchema,
        await rpc('post_purchase_receipt', {
          p_receipt_id: id,
          p_expected_version: version,
          p_cost_lines: costs,
          p_idempotency_key: crypto.randomUUID(),
        }),
      );
    },
    async listOpenings() {
      return parse(
        openingPageSchema,
        await rpc('list_opening_stock_documents', {
          p_cursor_updated_at: null,
          p_cursor_id: null,
          p_limit: 100,
        }),
      );
    },
    async getOpening(id: string) {
      return parse(
        openingDocumentSchema,
        await rpc('get_opening_stock_document', { p_count_id: id }),
      );
    },
    async saveOpening(input: {
      id?: string;
      expectedVersion?: number;
      note: string;
      lines: Array<{
        productId: string;
        countedQty: string;
        openingUnitCost: string;
        sourceSuggestionId: string | null;
        confirmedUnverified: boolean;
      }>;
    }) {
      return parse(
        mutationSchema,
        await rpc('save_opening_stock_draft', {
          p_count_id: nullable(input.id),
          p_expected_version: nullable(input.expectedVersion),
          p_note: input.note || null,
          p_lines: input.lines,
          p_idempotency_key: crypto.randomUUID(),
        }),
      );
    },
    async commandOpening(
      command: 'submit' | 'post' | 'cancel',
      id: string,
      version: number,
      reason = '',
    ) {
      const names = {
        submit: 'submit_opening_stock',
        post: 'post_opening_stock',
        cancel: 'cancel_opening_stock',
      } as const;
      const args =
        command === 'cancel'
          ? {
              p_count_id: id,
              p_expected_version: version,
              p_reason: reason,
              p_idempotency_key: crypto.randomUUID(),
            }
          : {
              p_count_id: id,
              p_expected_version: version,
              p_idempotency_key: crypto.randomUUID(),
            };
      return parse(mutationSchema, await rpc(names[command], args));
    },
    async listSuggestions() {
      return parse(
        suggestionPageSchema,
        await rpc('list_opening_balance_suggestions', {
          p_cursor_id: null,
          p_limit: 100,
        }),
      );
    },
    async valuation() {
      return parse(
        valuationPageSchema,
        await rpc('get_inventory_valuation', {
          p_cursor_name: null,
          p_cursor_id: null,
          p_limit: 100,
        }),
      );
    },
    async listStockCounts(status?: string) {
      return parse(
        periodicCountPageSchema,
        await rpc('list_stock_counts', {
          p_filters: status ? { status } : {},
          p_cursor_updated_at: null,
          p_cursor_id: null,
          p_limit: 100,
        }),
      );
    },
    async getStockCount(id: string) {
      return parse(
        periodicCountSchema,
        await rpc('get_stock_count', { p_count_id: id }),
      );
    },
    async saveStockCount(input: {
      id?: string;
      expectedVersion?: number;
      note: string;
      lines: Array<{ productId: string; countedQty: string | null }>;
      idempotencyKey: string;
    }) {
      return parse(
        mutationSchema,
        await rpc('save_stock_count', {
          p_count_id: nullable(input.id),
          p_expected_version: nullable(input.expectedVersion),
          p_note: input.note || null,
          p_lines: input.lines.map((line) => ({
            productId: line.productId,
            countedQty: line.countedQty,
          })),
          p_idempotency_key: input.idempotencyKey,
        }),
      );
    },
    async commandStockCount(
      command: 'submit' | 'refresh' | 'cancel',
      id: string,
      version: number,
      reason = '',
    ) {
      const names = {
        submit: 'submit_stock_count',
        refresh: 'refresh_stock_count_snapshot',
        cancel: 'cancel_stock_count',
      } as const;
      const args =
        command === 'cancel'
          ? {
              p_count_id: id,
              p_expected_version: version,
              p_reason: reason,
              p_idempotency_key: crypto.randomUUID(),
            }
          : {
              p_count_id: id,
              p_expected_version: version,
              p_idempotency_key: crypto.randomUUID(),
            };
      return parse(mutationSchema, await rpc(names[command], args));
    },
    async postStockCount(
      id: string,
      version: number,
      estimates: Array<{ stockCountLineId: string; estimatedUnitCost: string }>,
    ) {
      return parse(
        mutationSchema,
        await rpc('post_stock_count', {
          p_count_id: id,
          p_expected_version: version,
          p_estimated_costs: estimates,
          p_idempotency_key: crypto.randomUUID(),
        }),
      );
    },
  };
}
