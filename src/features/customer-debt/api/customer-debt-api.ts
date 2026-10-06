import { z } from 'zod';
import { getSupabaseClient } from '@/shared/supabase/client';
import { parseRpcEnvelope } from '@/shared/api/rpc-envelope';
import { getBusinessErrorMessage } from '@/shared/api/command-error';
import {
  FinancialBusinessError,
  FinancialTransportError,
} from '@/shared/api/financial-command';

const money = z.string().regex(/^(0|[1-9][0-9]{0,17})(\.[0-9]{1,2})?$/);
const debtSchema = z.object({
  customerId: z.uuid(),
  balance: money,
  version: z.number().int().positive(),
});
const mutationSchema = debtSchema.extend({ entryId: z.uuid() });
export const debtCursorSchema = z.object({
  occurredAt: z.string(),
  id: z.uuid(),
});
const entrySchema = z.object({
  id: z.uuid(),
  kind: z.enum([
    'SALE_CREDIT',
    'COLLECTION',
    'ADJUSTMENT',
    'RETURN_OFFSET',
    'SALE_CANCELLED',
  ]),
  delta: z.string().regex(/^-?(0|[1-9][0-9]{0,17})(\.[0-9]{1,2})?$/),
  balanceAfter: money,
  cashAmount: money,
  bankTransferAmount: money,
  note: z.string().nullable(),
  occurredAt: z.string(),
  actorName: z.string(),
  saleId: z.uuid().nullable(),
  saleNumber: z.string().nullable(),
});
const entriesSchema = z.object({
  items: z.array(entrySchema),
  nextCursor: debtCursorSchema.nullable(),
});
export type DebtCursor = z.infer<typeof debtCursorSchema>;
export class CustomerDebtApiError extends FinancialBusinessError {
  constructor(
    readonly code: string,
    readonly correlationId: string,
    readonly details: Record<string, unknown>,
  ) {
    super(getBusinessErrorMessage(code));
    this.name = 'CustomerDebtApiError';
  }
}
function parse<T>(schema: z.ZodType<T>, value: unknown) {
  return parseRpcEnvelope(schema, value, {
    invalidMessage: 'Phản hồi công nợ không hợp lệ.',
    createBusinessError: (error, correlationId) =>
      new CustomerDebtApiError(error.code, correlationId, error.details),
  });
}
export function createCustomerDebtApi() {
  const client = getSupabaseClient();
  async function rpc(
    name: Parameters<typeof client.rpc>[0],
    args: Record<string, unknown>,
  ) {
    const { data, error } = await client.rpc(name, args as never);
    if (error) throw new FinancialTransportError();
    return data;
  }
  return {
    async detail(customerId: string) {
      return parse(
        debtSchema,
        await rpc('get_customer_debt', { p_customer_id: customerId }),
      );
    },
    async entries(customerId: string, cursor?: DebtCursor) {
      return parse(
        entriesSchema,
        await rpc('list_customer_debt_entries', {
          p_customer_id: customerId,
          p_cursor_at: cursor?.occurredAt ?? null,
          p_cursor_id: cursor?.id ?? null,
          p_limit: 20,
        }),
      );
    },
    async collect(input: {
      customerId: string;
      expectedVersion: number;
      cashAmount: string;
      bankTransferAmount: string;
      note: string;
      idempotencyKey: string;
    }) {
      return parse(
        mutationSchema,
        await rpc('collect_customer_debt', {
          p_customer_id: input.customerId,
          p_expected_version: input.expectedVersion,
          p_cash_amount: input.cashAmount,
          p_bank_transfer_amount: input.bankTransferAmount,
          p_note: input.note,
          p_idempotency_key: input.idempotencyKey,
        }),
      );
    },
    async adjust(input: {
      customerId: string;
      expectedVersion: number;
      newBalance: string;
      reason: string;
      idempotencyKey: string;
    }) {
      return parse(
        mutationSchema,
        await rpc('adjust_customer_debt', {
          p_customer_id: input.customerId,
          p_expected_version: input.expectedVersion,
          p_new_balance: input.newBalance,
          p_reason: input.reason,
          p_idempotency_key: input.idempotencyKey,
        }),
      );
    },
    parseMutationResponse(value: unknown) {
      return parse(mutationSchema, value);
    },
  };
}
export type CustomerDebtApi = ReturnType<typeof createCustomerDebtApi>;
