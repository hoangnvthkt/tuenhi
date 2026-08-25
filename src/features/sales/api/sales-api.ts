import { z } from 'zod';
import { getBusinessErrorMessage } from '@/shared/api/command-error';
import { parseRpcEnvelope } from '@/shared/api/rpc-envelope';
import { getSupabaseClient } from '@/shared/supabase/client';
import {
  invoiceSchema,
  saleListSchema,
  saleSchema,
  type CartLine,
} from './sales-schemas';

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

function parseSalesRpc<T>(schema: z.ZodType<T>, value: unknown): T {
  return parseRpcEnvelope(schema, value, {
    invalidMessage: 'Phản hồi bán hàng từ máy chủ không hợp lệ.',
    createBusinessError: (error, correlationId) =>
      new SalesApiError(error.code, correlationId, error.details),
  });
}

function transportFailure() {
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
    if (error) throw transportFailure();
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
      return parseSalesRpc(
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
      return parseSalesRpc(
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
      transferProofPath?: string,
    ) {
      return parseSalesRpc(
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
          p_transfer_proof_path: transferProofPath ?? null,
        }),
      );
    },
    async detail(saleId: string) {
      return parseSalesRpc(
        saleSchema,
        await rpc('get_sale_detail', { p_sale_id: saleId }),
      );
    },
    async list(filters: { status?: string; search?: string } = {}) {
      return parseSalesRpc(
        saleListSchema,
        await rpc('list_sales', {
          p_filters: filters,
          p_cursor_sort_at: null,
          p_cursor_id: null,
          p_limit: 50,
        }),
      );
    },
    async invoice(saleId: string) {
      return parseSalesRpc(
        invoiceSchema,
        await rpc('get_sale_invoice', { p_sale_id: saleId }),
      );
    },
    async cancelSale(
      saleId: string,
      expectedVersion: number,
      reason: string,
      idempotencyKey: string,
    ) {
      return parseSalesRpc(
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

export type SalesApi = ReturnType<typeof createSalesApi>;
