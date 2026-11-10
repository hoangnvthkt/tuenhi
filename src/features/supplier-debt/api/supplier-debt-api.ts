import { z } from 'zod';
import { getSupabaseClient } from '@/shared/supabase/client';
import { parseRpcEnvelope } from '@/shared/api/rpc-envelope';
import { getBusinessErrorMessage } from '@/shared/api/command-error';
import {
  FinancialBusinessError,
  FinancialTransportError,
} from '@/shared/api/financial-command';

const money = z.string().regex(/^-?(0|[1-9][0-9]{0,17})(\.[0-9]{1,2})?$/);
const qty = z.string().regex(/^-?(0|[1-9][0-9]*)$/);

const summarySchema = z.object({
  totalPayable: money,
  supplierCount: z.number().int(),
  openPayableCount: z.number().int(),
  paidThisMonth: money,
  returnedThisMonth: money,
  returnCountThisMonth: z.number().int(),
});
const debtsSchema = z.object({
  summary: summarySchema,
  items: z.array(
    z.object({
      supplierId: z.uuid(),
      code: z.string(),
      name: z.string(),
      balance: money,
      openCount: z.number().int(),
      oldestOpenAt: z.string().nullable(),
      version: z.number().int(),
    }),
  ),
});
export type SupplierDebts = z.infer<typeof debtsSchema>;
const entryKinds = z.enum([
  'RECEIPT_POSTED',
  'RECEIPT_REVERSED',
  'OPENING',
  'PAYMENT',
  'PURCHASE_RETURN',
]);
const debtSchema = z.object({
  supplier: z.object({ id: z.uuid(), code: z.string(), name: z.string() }),
  balance: money,
  version: z.number().int().nonnegative(),
  hasOpening: z.boolean(),
  openPayables: z.array(
    z.object({
      payableId: z.uuid(),
      kind: z.enum(['RECEIPT', 'OPENING']),
      receiptId: z.uuid().nullable(),
      receiptNumber: z.string().nullable(),
      openedAt: z.string(),
      totalAmount: money,
      paidAmount: money,
      returnedAmount: money,
      outstandingAmount: money,
    }),
  ),
  entries: z.array(
    z.object({
      id: z.uuid(),
      kind: entryKinds,
      delta: money,
      balanceAfter: money,
      cashAmount: money,
      bankTransferAmount: money,
      note: z.string().nullable(),
      receiptId: z.uuid().nullable(),
      receiptNumber: z.string().nullable(),
      returnNumber: z.string().nullable(),
      actorName: z.string().nullable(),
      occurredAt: z.string(),
    }),
  ),
});
export type SupplierDebt = z.infer<typeof debtSchema>;
const mutationSchema = z.object({
  supplierId: z.uuid(),
  balance: money,
  version: z.number().int(),
});
const returnOptionsSchema = z.object({
  receiptId: z.uuid(),
  receiptNumber: z.string().nullable(),
  status: z.string(),
  receivedAt: z.string().nullable(),
  supplier: z
    .object({ id: z.uuid(), code: z.string(), name: z.string() })
    .nullable(),
  outstandingAmount: money.nullable(),
  lines: z.array(
    z.object({
      receiptLineId: z.uuid(),
      productId: z.uuid(),
      productName: z.string(),
      unitName: z.string(),
      receivedQty: qty,
      returnedQty: qty,
      onHandQty: qty,
      maxQty: qty,
      unitCost: money,
      lineCost: money,
      returnedAmount: money,
    }),
  ),
  returns: z.array(
    z.object({
      returnId: z.uuid(),
      returnNumber: z.string(),
      postedAt: z.string(),
      totalAmount: money,
      debtApplied: money,
      refundAmount: money,
      reason: z.string(),
    }),
  ),
});
export type PurchaseReturnOptions = z.infer<typeof returnOptionsSchema>;
const returnResultSchema = z.object({
  returnId: z.uuid(),
  returnNumber: z.string(),
  totalAmount: money,
  debtApplied: money,
  refundAmount: money,
});
const writeOffProductsSchema = z.object({
  items: z.array(
    z.object({
      productId: z.uuid(),
      name: z.string(),
      sku: z.string(),
      unitName: z.string(),
      onHandQty: qty,
      avgUnitCost: money.nullable(),
      avgUnitCostExact: z
        .string()
        .regex(/^(0|[1-9][0-9]*)(\.[0-9]{1,6})?$/)
        .nullable(),
      inventoryValue: money.nullable(),
    }),
  ),
});
export type WriteOffProduct = z.infer<
  typeof writeOffProductsSchema
>['items'][number];
export const writeOffReasonSchema = z.enum([
  'EXPIRED',
  'DAMAGED',
  'LOST',
  'OTHER',
]);
export type WriteOffReason = z.infer<typeof writeOffReasonSchema>;
const writeOffResultSchema = z.object({
  writeOffId: z.uuid(),
  writeOffNumber: z.string(),
  totalValue: money.nullable(),
});
const writeOffsSchema = z.object({
  items: z.array(
    z.object({
      id: z.uuid(),
      writeOffNumber: z.string(),
      reasonCode: writeOffReasonSchema,
      note: z.string().nullable(),
      postedAt: z.string(),
      actorName: z.string().nullable(),
      totalValue: money.nullable(),
      lines: z.array(
        z.object({
          productName: z.string(),
          unitName: z.string(),
          quantity: qty,
          lineValue: money.nullable(),
        }),
      ),
    }),
  ),
});
export type StockWriteOffs = z.infer<typeof writeOffsSchema>;

export class SupplierDebtApiError extends FinancialBusinessError {
  constructor(
    readonly code: string,
    readonly correlationId: string,
    readonly details: Record<string, unknown>,
  ) {
    super(getBusinessErrorMessage(code));
    this.name = 'SupplierDebtApiError';
  }
}
function parse<T>(schema: z.ZodType<T>, value: unknown) {
  return parseRpcEnvelope(schema, value, {
    invalidMessage: 'Phản hồi công nợ NCC không hợp lệ.',
    createBusinessError: (error, correlationId) =>
      new SupplierDebtApiError(error.code, correlationId, error.details),
  });
}

export function createSupplierDebtApi() {
  const client = getSupabaseClient();
  async function rpc(name: string, args: Record<string, unknown>) {
    const { data, error } = await client.rpc(name as never, args as never);
    if (error) throw new FinancialTransportError();
    return data;
  }
  return {
    async debts() {
      return parse(debtsSchema, await rpc('get_supplier_debts', {}));
    },
    async debt(supplierId: string) {
      return parse(
        debtSchema,
        await rpc('get_supplier_debt', { p_supplier_id: supplierId }),
      );
    },
    async pay(input: {
      supplierId: string;
      expectedVersion: number;
      cashAmount: string;
      bankTransferAmount: string;
      note: string;
      idempotencyKey: string;
    }) {
      return parse(
        mutationSchema,
        await rpc('pay_supplier_debt', {
          p_supplier_id: input.supplierId,
          p_expected_version: input.expectedVersion,
          p_cash_amount: input.cashAmount,
          p_bank_transfer_amount: input.bankTransferAmount,
          p_note: input.note,
          p_idempotency_key: input.idempotencyKey,
        }),
      );
    },
    async setOpening(input: {
      supplierId: string;
      amount: string;
      note: string;
      idempotencyKey: string;
    }) {
      return parse(
        mutationSchema,
        await rpc('set_supplier_opening_debt', {
          p_supplier_id: input.supplierId,
          p_amount: input.amount,
          p_note: input.note,
          p_idempotency_key: input.idempotencyKey,
        }),
      );
    },
    async returnOptions(receiptId: string) {
      return parse(
        returnOptionsSchema,
        await rpc('get_purchase_return_options', { p_receipt_id: receiptId }),
      );
    },
    async postReturn(input: {
      receiptId: string;
      lines: { receiptLineId: string; quantity: string }[];
      reason: string;
      refundMethod: 'CASH' | 'BANK_TRANSFER' | null;
      idempotencyKey: string;
    }) {
      return parse(
        returnResultSchema,
        await rpc('post_purchase_return', {
          p_receipt_id: input.receiptId,
          p_lines: input.lines,
          p_reason: input.reason,
          p_refund_method: input.refundMethod,
          p_idempotency_key: input.idempotencyKey,
        }),
      );
    },
    async writeOffProducts(productIds: string[]) {
      return parse(
        writeOffProductsSchema,
        await rpc('get_write_off_products', { p_product_ids: productIds }),
      ).items;
    },
    async postWriteOff(input: {
      lines: { productId: string; quantity: string }[];
      reasonCode: WriteOffReason;
      note: string;
      idempotencyKey: string;
    }) {
      return parse(
        writeOffResultSchema,
        await rpc('post_stock_write_off', {
          p_lines: input.lines,
          p_reason_code: input.reasonCode,
          p_note: input.note,
          p_idempotency_key: input.idempotencyKey,
        }),
      );
    },
    async writeOffs() {
      return parse(
        writeOffsSchema,
        await rpc('list_stock_write_offs', { p_limit: 30 }),
      );
    },
    parseMutation: (response: unknown) => parse(mutationSchema, response),
    parseReturn: (response: unknown) => parse(returnResultSchema, response),
    parseWriteOff: (response: unknown) => parse(writeOffResultSchema, response),
  };
}
export type SupplierDebtApi = ReturnType<typeof createSupplierDebtApi>;
