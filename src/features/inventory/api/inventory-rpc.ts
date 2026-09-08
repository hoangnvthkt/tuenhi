import { z } from 'zod';
import { getBusinessErrorMessage } from '@/shared/api/command-error';
import {
  FinancialBusinessError,
  FinancialTransportError,
} from '@/shared/api/financial-command';
import { parseRpcEnvelope } from '@/shared/api/rpc-envelope';
import { getSupabaseClient } from '@/shared/supabase/client';
import type { Json } from '@/shared/supabase/database.types';

export class InventoryApiError extends FinancialBusinessError {
  constructor(
    readonly code: string,
    readonly correlationId: string,
    readonly details: Record<string, unknown>,
  ) {
    super(getBusinessErrorMessage(code));
    this.name = 'InventoryApiError';
  }
}

export const inventoryStatusSchema = z.enum([
  'DRAFT',
  'AWAITING_COST',
  'COUNTED',
  'POSTED',
  'REVERSED',
  'CANCELLED',
]);
export const inventoryDateTimeSchema = z.iso.datetime({ offset: true });
export const inventoryCursorSchema = z.object({
  updatedAt: inventoryDateTimeSchema,
  id: z.uuid(),
});
export const inventoryMutationSchema = z.record(z.string(), z.unknown());
type InventoryRpcName =
  | Parameters<ReturnType<typeof getSupabaseClient>['rpc']>[0]
  | 'resolve_purchase_receipt_products';

export function parseInventoryRpc<T>(schema: z.ZodType<T>, value: unknown): T {
  return parseRpcEnvelope(schema, value, {
    invalidMessage: 'Phản hồi kho từ máy chủ không hợp lệ.',
    createBusinessError: (payload, correlationId) =>
      new InventoryApiError(payload.code, correlationId, payload.details),
  });
}

export function nullable<T>(value: T | undefined): T {
  return (value ?? null) as T;
}

export function createInventoryRpc() {
  const client = getSupabaseClient();
  return async function call<T>(
    name: InventoryRpcName,
    args: Json,
    schema: z.ZodType<T>,
  ): Promise<T> {
    const { data, error } = await client.rpc(name as never, args as never);
    if (error) {
      throw new FinancialTransportError();
    }
    return parseInventoryRpc(schema, data);
  };
}
