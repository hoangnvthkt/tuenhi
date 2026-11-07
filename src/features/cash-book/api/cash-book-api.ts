import { z } from 'zod';
import { getSupabaseClient } from '@/shared/supabase/client';
import { parseRpcEnvelope } from '@/shared/api/rpc-envelope';
import { getBusinessErrorMessage } from '@/shared/api/command-error';
import {
  FinancialBusinessError,
  FinancialTransportError,
} from '@/shared/api/financial-command';

const money = z.string().regex(/^-?(0|[1-9][0-9]{0,17})(\.[0-9]{1,2})?$/);
export const fundSchema = z.enum(['CASH', 'BANK']);
export type Fund = z.infer<typeof fundSchema>;
export const voucherCategorySchema = z.enum([
  'OWNER_CONTRIBUTION',
  'EXPENSE',
  'OWNER_WITHDRAWAL',
  'FUND_TRANSFER',
  'OTHER',
  'REVERSAL',
]);
export type VoucherCategory = z.infer<typeof voucherCategorySchema>;

export const shiftSchema = z.object({
  id: z.uuid(),
  shiftNumber: z.string(),
  userId: z.uuid(),
  userName: z.string().nullable(),
  status: z.enum(['OPEN', 'CLOSED']),
  openedAt: z.string(),
  closedAt: z.string().nullable(),
  openingCash: money,
  cashIn: money,
  cashOut: money,
  cashInCount: z.number().int().nonnegative(),
  cashOutCount: z.number().int().nonnegative(),
  bankIn: money,
  bankOut: money,
  expectedCash: money,
  countedCash: money.nullable(),
  difference: money.nullable(),
  closeNote: z.string().nullable(),
  version: z.number().int().positive(),
});
export type CashShift = z.infer<typeof shiftSchema>;

const entrySchema = z.object({
  entryKey: z.string(),
  occurredAt: z.string(),
  direction: z.enum(['IN', 'OUT']),
  source: z.enum([
    'SALE_RECEIPT',
    'SALE_CANCEL',
    'RETURN_REFUND',
    'DEBT_COLLECTION',
    'VOUCHER',
  ]),
  category: voucherCategorySchema.nullable(),
  amount: money,
  documentType: z.enum(['SALE', 'RETURN', 'CUSTOMER', 'VOUCHER']),
  documentId: z.uuid(),
  documentNumber: z.string().nullable(),
  party: z.string().nullable(),
  memo: z.string().nullable(),
  actorName: z.string().nullable(),
  balanceAfter: money.nullable(),
  canCancel: z.boolean(),
});
export type CashBookEntry = z.infer<typeof entrySchema>;
export const cashCursorSchema = z.object({
  occurredAt: z.string(),
  key: z.string(),
});
export type CashCursor = z.infer<typeof cashCursorSchema>;

export const cashBookSchema = z.object({
  version: z.literal(1),
  fund: fundSchema,
  scope: z.enum(['OWN', 'ALL', 'SHIFT']),
  opening: z.object({ asOf: z.string(), amount: money }).nullable(),
  fundBalances: z.object({ CASH: money, BANK: money }).nullable(),
  openings: z.object({ CASH: z.boolean(), BANK: z.boolean() }).nullable(),
  shift: shiftSchema.nullable(),
  summary: z.object({
    totalIn: money,
    totalOut: money,
    inCount: z.number().int().nonnegative(),
    outCount: z.number().int().nonnegative(),
    openingBalance: money.nullable(),
    closingBalance: money.nullable(),
  }),
  items: z.array(entrySchema),
  nextCursor: cashCursorSchema.nullable(),
});
export type CashBook = z.infer<typeof cashBookSchema>;

const myShiftSchema = z.object({ shift: shiftSchema.nullable() });
const shiftPageSchema = z.object({
  items: z.array(shiftSchema),
  nextCursor: z.object({ openedAt: z.string(), id: z.uuid() }).nullable(),
});
export type ShiftCursor = NonNullable<
  z.infer<typeof shiftPageSchema>['nextCursor']
>;
const voucherResultSchema = z.object({
  voucherId: z.uuid(),
  voucherNumber: z.string(),
  transferVoucherId: z.uuid().nullable(),
  transferVoucherNumber: z.string().nullable(),
});
const cancelResultSchema = z.object({
  voucherId: z.uuid(),
  reversals: z.array(
    z.object({
      voucherId: z.uuid(),
      voucherNumber: z.string(),
      reversalId: z.uuid(),
      reversalNumber: z.string(),
    }),
  ),
});
const openingResultSchema = z.object({
  fund: fundSchema,
  asOf: z.string(),
  amount: money,
});

export class CashBookApiError extends FinancialBusinessError {
  constructor(
    readonly code: string,
    readonly correlationId: string,
    readonly details: Record<string, unknown>,
  ) {
    super(getBusinessErrorMessage(code));
    this.name = 'CashBookApiError';
  }
}

function parse<T>(schema: z.ZodType<T>, value: unknown) {
  return parseRpcEnvelope(schema, value, {
    invalidMessage: 'Phản hồi sổ quỹ không hợp lệ.',
    createBusinessError: (error, correlationId) =>
      new CashBookApiError(error.code, correlationId, error.details),
  });
}

export function createCashBookApi() {
  const client = getSupabaseClient();
  async function rpc(name: string, args: Record<string, unknown>) {
    const { data, error } = await client.rpc(name as never, args as never);
    if (error) throw new FinancialTransportError();
    return data;
  }
  return {
    async book(input: {
      fund: Fund;
      from?: string;
      to?: string;
      scope: 'OWN' | 'ALL';
      shiftId?: string | null;
      cursor?: CashCursor;
    }) {
      return parse(
        cashBookSchema,
        await rpc('get_cash_book', {
          p_fund: input.fund,
          p_from: input.shiftId ? null : input.from,
          p_to: input.shiftId ? null : input.to,
          p_scope: input.scope,
          p_shift_id: input.shiftId ?? null,
          p_cursor_occurred_at: input.cursor?.occurredAt ?? null,
          p_cursor_key: input.cursor?.key ?? null,
          p_limit: 50,
        }),
      );
    },
    async myShift() {
      return parse(myShiftSchema, await rpc('get_my_cash_shift', {})).shift;
    },
    async shifts(scope: 'OWN' | 'ALL', cursor?: ShiftCursor) {
      return parse(
        shiftPageSchema,
        await rpc('list_cash_shifts', {
          p_scope: scope,
          p_cursor_opened_at: cursor?.openedAt ?? null,
          p_cursor_id: cursor?.id ?? null,
          p_limit: 30,
        }),
      );
    },
    async createVoucher(input: {
      fund: Fund;
      direction: 'IN' | 'OUT';
      category: Exclude<VoucherCategory, 'REVERSAL'>;
      amount: string;
      party: string;
      memo: string;
      idempotencyKey: string;
    }) {
      return parse(
        voucherResultSchema,
        await rpc('create_cash_voucher', {
          p_fund: input.fund,
          p_direction: input.direction,
          p_category: input.category,
          p_amount: input.amount,
          p_party: input.party,
          p_memo: input.memo,
          p_idempotency_key: input.idempotencyKey,
        }),
      );
    },
    async cancelVoucher(input: {
      voucherId: string;
      reason: string;
      idempotencyKey: string;
    }) {
      return parse(
        cancelResultSchema,
        await rpc('cancel_cash_voucher', {
          p_voucher_id: input.voucherId,
          p_reason: input.reason,
          p_idempotency_key: input.idempotencyKey,
        }),
      );
    },
    async setOpening(input: {
      fund: Fund;
      asOf: string;
      amount: string;
      idempotencyKey: string;
    }) {
      return parse(
        openingResultSchema,
        await rpc('set_cash_fund_opening', {
          p_fund: input.fund,
          p_as_of: input.asOf,
          p_amount: input.amount,
          p_idempotency_key: input.idempotencyKey,
        }),
      );
    },
    async openShift(input: { openingCash: string; idempotencyKey: string }) {
      return parse(
        shiftSchema,
        await rpc('open_cash_shift', {
          p_opening_cash: input.openingCash,
          p_idempotency_key: input.idempotencyKey,
        }),
      );
    },
    async closeShift(input: {
      shiftId: string;
      expectedVersion: number;
      countedCash: string;
      note: string;
      idempotencyKey: string;
    }) {
      return parse(
        shiftSchema,
        await rpc('close_cash_shift', {
          p_shift_id: input.shiftId,
          p_expected_version: input.expectedVersion,
          p_counted_cash: input.countedCash,
          p_note: input.note,
          p_idempotency_key: input.idempotencyKey,
        }),
      );
    },
    parseVoucher: (response: unknown) => parse(voucherResultSchema, response),
    parseCancel: (response: unknown) => parse(cancelResultSchema, response),
    parseOpening: (response: unknown) => parse(openingResultSchema, response),
    parseShift: (response: unknown) => parse(shiftSchema, response),
  };
}
export type CashBookApi = ReturnType<typeof createCashBookApi>;
