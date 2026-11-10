import { z } from 'zod';
import { getSupabaseClient } from '@/shared/supabase/client';
import { parseRpcEnvelope } from '@/shared/api/rpc-envelope';
import { getBusinessErrorMessage } from '@/shared/api/command-error';
import {
  FinancialBusinessError,
  FinancialTransportError,
} from '@/shared/api/financial-command';

const qty = z.string().regex(/^-?(0|[1-9][0-9]*)$/);
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
export const trackingModeSchema = z.enum(['NONE', 'EXPIRY', 'LOT']);
export type TrackingMode = z.infer<typeof trackingModeSchema>;

const featuresSchema = z.object({
  lotTrackingEnabled: z.boolean(),
  expiryWarningDays: z.number().int(),
  version: z.number().int(),
  trackedProductCount: z.number().int(),
});
export type InventoryFeatures = z.infer<typeof featuresSchema>;
const trackingSchema = z.object({
  productId: z.uuid(),
  trackingMode: trackingModeSchema,
  unassignedQty: qty,
});
export const lotRowSchema = z.object({
  lotNumber: z.string().nullable(),
  expiryDate: isoDate,
  quantity: qty,
});
export type LotRow = z.infer<typeof lotRowSchema>;
const receiptLotsSchema = z.object({
  items: z.array(
    z.object({
      productId: z.uuid(),
      productName: z.string(),
      unitName: z.string(),
      receivedQty: qty,
      trackingMode: trackingModeSchema,
      lots: z.array(lotRowSchema),
    }),
  ),
});
export type ReceiptLots = z.infer<typeof receiptLotsSchema>;
const assignSchema = z.object({
  productId: z.uuid(),
  assignedQty: qty,
  unassignedQty: qty,
});
export const lotStatusSchema = z.enum(['EXPIRED', 'EXPIRING', 'OK']);
export type LotStatus = z.infer<typeof lotStatusSchema>;
const lotListSchema = z.object({
  warningDays: z.number().int(),
  trackingMode: trackingModeSchema.nullable(),
  unassignedQty: qty.nullable(),
  summary: z.object({
    expired: z.number().int(),
    expiring: z.number().int(),
    ok: z.number().int(),
  }),
  items: z.array(
    z.object({
      lotId: z.uuid(),
      productId: z.uuid(),
      productName: z.string(),
      unitName: z.string(),
      trackingMode: trackingModeSchema,
      lotNumber: z.string().nullable(),
      expiryDate: isoDate,
      daysLeft: z.number().int(),
      quantity: qty,
      status: lotStatusSchema,
    }),
  ),
  unassigned: z.array(
    z.object({
      productId: z.uuid(),
      productName: z.string(),
      unitName: z.string(),
      trackingMode: trackingModeSchema,
      quantity: qty,
    }),
  ),
});
export type LotList = z.infer<typeof lotListSchema>;

export class LotsApiError extends FinancialBusinessError {
  constructor(
    readonly code: string,
    readonly correlationId: string,
    readonly details: Record<string, unknown>,
  ) {
    super(getBusinessErrorMessage(code));
    this.name = 'LotsApiError';
  }
}
function parse<T>(schema: z.ZodType<T>, value: unknown) {
  return parseRpcEnvelope(schema, value, {
    invalidMessage: 'Phản hồi lô hàng không hợp lệ.',
    createBusinessError: (error, correlationId) =>
      new LotsApiError(error.code, correlationId, error.details),
  });
}

export function createLotsApi() {
  const client = getSupabaseClient();
  async function rpc(name: string, args: Record<string, unknown>) {
    const { data, error } = await client.rpc(name as never, args as never);
    if (error) throw new FinancialTransportError();
    return data;
  }
  return {
    async features() {
      return parse(featuresSchema, await rpc('get_inventory_features', {}));
    },
    async setFeatures(input: {
      expectedVersion: number;
      lotTrackingEnabled: boolean;
      expiryWarningDays: number;
    }) {
      return parse(
        featuresSchema,
        await rpc('set_inventory_features', {
          p_expected_version: input.expectedVersion,
          p_lot_tracking_enabled: input.lotTrackingEnabled,
          p_expiry_warning_days: input.expiryWarningDays,
        }),
      );
    },
    async setTracking(productId: string, mode: TrackingMode) {
      return parse(
        trackingSchema,
        await rpc('set_product_tracking', {
          p_product_id: productId,
          p_mode: mode,
        }),
      );
    },
    async receiptLots(receiptId: string) {
      return parse(
        receiptLotsSchema,
        await rpc('get_purchase_receipt_lots', { p_receipt_id: receiptId }),
      );
    },
    async setReceiptLots(
      receiptId: string,
      lots: { productId: string; lots: LotRow[] }[],
    ) {
      return parse(
        receiptLotsSchema,
        await rpc('set_purchase_receipt_lots', {
          p_receipt_id: receiptId,
          p_lots: lots,
        }),
      );
    },
    async assign(input: {
      productId: string;
      lots: LotRow[];
      idempotencyKey: string;
    }) {
      return parse(
        assignSchema,
        await rpc('assign_unassigned_lots', {
          p_product_id: input.productId,
          p_lots: input.lots,
          p_idempotency_key: input.idempotencyKey,
        }),
      );
    },
    async list(status: 'ALL' | LotStatus, productId?: string | null) {
      return parse(
        lotListSchema,
        await rpc('list_product_lots', {
          p_status: status,
          p_product_id: productId ?? null,
          p_limit: 200,
        }),
      );
    },
    parseAssign: (response: unknown) => parse(assignSchema, response),
  };
}
export type LotsApi = ReturnType<typeof createLotsApi>;
