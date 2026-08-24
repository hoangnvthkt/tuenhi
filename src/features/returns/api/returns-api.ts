import { z } from 'zod';
import { getBusinessErrorMessage } from '@/shared/api/command-error';
import { parseRpcEnvelope } from '@/shared/api/rpc-envelope';
import { getSupabaseClient } from '@/shared/supabase/client';
import {
  returnLookupSchema,
  returnPageSchema,
  saleReturnSchema,
} from './returns-schemas';

export class ReturnsApiError extends Error {
  constructor(
    readonly code: string,
    readonly correlationId: string,
    readonly details: Record<string, unknown>,
  ) {
    super(getBusinessErrorMessage(code));
    this.name = 'ReturnsApiError';
  }
}

function parseReturnsRpc<T>(schema: z.ZodType<T>, value: unknown): T {
  return parseRpcEnvelope(schema, value, {
    invalidMessage: 'Phản hồi trả hàng từ máy chủ không hợp lệ.',
    createBusinessError: (error, correlationId) =>
      new ReturnsApiError(error.code, correlationId, error.details),
  });
}

function transportFailure() {
  return new Error(
    'Không thể kết nối máy chủ. Kết quả thao tác có thể chưa xác định.',
  );
}

export function createReturnsApi() {
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
    async lookupInvoice(fullSaleNumber: string) {
      return parseReturnsRpc(
        returnLookupSchema,
        await rpc('lookup_sale_for_return', {
          p_full_sale_number: fullSaleNumber,
        }),
      );
    },
    async create(input: {
      saleId: string;
      reason: string;
      lines: Array<{ originalSaleLineId: string; requestedQty: string }>;
      idempotencyKey: string;
    }) {
      return parseReturnsRpc(
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
    async list(filters: { status?: string; search?: string } = {}) {
      return parseReturnsRpc(
        returnPageSchema,
        await rpc('list_sale_returns', {
          p_filters: filters,
          p_cursor_updated_at: null,
          p_cursor_id: null,
          p_limit: 50,
        }),
      );
    },
    async detail(returnId: string) {
      return parseReturnsRpc(
        saleReturnSchema,
        await rpc('get_sale_return', { p_return_id: returnId }),
      );
    },
    async cancel(
      returnId: string,
      expectedVersion: number,
      reason: string,
      idempotencyKey: string,
    ) {
      return parseReturnsRpc(
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
    async complete(input: {
      returnId: string;
      expectedVersion: number;
      lines: Array<{ saleReturnLineId: string; acceptedQty: string }>;
      refundMethod: 'CASH' | 'BANK_TRANSFER';
      idempotencyKey: string;
    }) {
      return parseReturnsRpc(
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
  };
}

export type ReturnsApi = ReturnType<typeof createReturnsApi>;
