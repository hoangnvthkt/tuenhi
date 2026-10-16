import { z } from 'zod';
import { parseRpcEnvelope } from '@/shared/api/rpc-envelope';
import { getSupabaseClient } from '@/shared/supabase/client';
import { ReportsApiError } from './reports-api';

const money = z.string().regex(/^-?(?:0|[1-9][0-9]*)(?:\.[0-9]{1,2})?$/);
export const settlementMethodSchema = z.enum([
  'ALL',
  'CASH',
  'BANK_TRANSFER',
  'DEBT',
]);
export type SettlementMethod = z.infer<typeof settlementMethodSchema>;
export const settlementReportSchema = z.object({
  version: z.literal(1),
  range: z.object({ from: z.string(), to: z.string() }),
  scope: z.enum(['OWN', 'ALL']),
  summary: z.object({
    cashAmount: money,
    bankTransferAmount: money,
    outstandingAmount: money,
  }),
  items: z.array(
    z.object({
      id: z.uuid(),
      saleNumber: z.string(),
      completedAt: z.string(),
      customerName: z.string().nullable(),
      status: z.string(),
      cashAmount: money,
      bankTransferAmount: money,
      outstandingAmount: money,
    }),
  ),
  nextCursor: z.object({ completedAt: z.string(), id: z.uuid() }).nullable(),
});
export type SettlementReport = z.infer<typeof settlementReportSchema>;
export type SettlementCursor = NonNullable<SettlementReport['nextCursor']>;
export function createSaleSettlementsApi() {
  const client = getSupabaseClient();
  return {
    async report(
      from: string,
      to: string,
      scope: 'OWN' | 'ALL',
      method: SettlementMethod = 'ALL',
      cursor?: SettlementCursor,
    ): Promise<SettlementReport> {
      const { data, error } = await client.rpc(
        'get_sale_settlement_report' as never,
        {
          p_from: from,
          p_to: to,
          p_scope: scope,
          p_method: method,
          p_cursor_completed_at: cursor?.completedAt ?? null,
          p_cursor_id: cursor?.id ?? null,
          p_limit: 50,
        } as never,
      );
      if (error) throw new Error('Không thể tải chi tiết thanh toán.');
      return parseRpcEnvelope(settlementReportSchema, data, {
        invalidMessage: 'Phản hồi thanh toán không hợp lệ.',
        createBusinessError: (payload, correlationId) =>
          new ReportsApiError(payload.code, correlationId, payload.details),
      });
    },
  };
}
