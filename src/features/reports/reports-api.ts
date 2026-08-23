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
export class ReportsApiError extends Error {
  constructor(
    readonly code: string,
    readonly correlationId: string,
  ) {
    super(getBusinessErrorMessage(code));
    this.name = 'ReportsApiError';
  }
}
function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = envelope(schema).safeParse(value);
  if (!result.success)
    throw new Error('Phản hồi báo cáo từ máy chủ không hợp lệ.');
  if (!result.data.ok)
    throw new ReportsApiError(
      result.data.error.code,
      result.data.correlationId,
    );
  return result.data.data;
}

const money = z.string();
const summarySchema = z.object({
  completedOrderCount: z.number().int().nonnegative(),
  soldQuantity: money,
  grossSales: money,
  lineDiscounts: money,
  orderDiscounts: money,
  salesReturns: money,
  cancellations: money,
  netRevenue: money,
  averageOrderValue: money.nullable(),
});
const dailySummarySchema = z.object({
  day: z.string(),
  completedOrderCount: z.number().int().nonnegative(),
  soldQuantity: money,
  grossSales: money,
  lineDiscounts: money,
  orderDiscounts: money,
  salesReturns: money,
  cancellations: money,
  netRevenue: money,
});
const revenueSchema = z.object({
  version: z.literal(1),
  timezone: z.literal('Asia/Ho_Chi_Minh'),
  range: z.object({ from: z.string(), to: z.string() }),
  generatedAt: z.string(),
  scope: z.enum(['OWN', 'ALL']).optional(),
  summary: summarySchema,
  daily: z.array(dailySummarySchema),
  channels: z.array(
    z.object({
      code: z.string(),
      name: z.string(),
      completedOrderCount: z.number().int(),
      grossSales: money,
      netRevenue: money,
    }),
  ),
  paymentMethods: z.array(
    z.object({
      method: z.string(),
      completedOrderCount: z.number().int(),
      grossSales: money,
      netRevenue: money,
    }),
  ),
});
const operationalSchema = z.object({
  version: z.literal(1),
  timezone: z.literal('Asia/Ho_Chi_Minh'),
  catalog: z.object({
    activeProductCount: z.number().int(),
    lowStockCount: z.number().int(),
    outOfStockCount: z.number().int(),
    totalOnHandQty: money,
  }),
  pending: z.object({
    purchaseReceipts: z.number().int(),
    stockCounts: z.number().int(),
    saleReturns: z.number().int(),
  }),
});
const ownerDashboardSchema = z.object({
  version: z.literal(1),
  netRevenue: money,
  netCogs: money,
  grossProfit: money,
  grossMarginPct: money.nullable(),
  inventoryValue: money,
});
const profitPageSchema = z.object({
  version: z.literal(1),
  items: z.array(
    z.object({
      id: z.uuid(),
      eventType: z.enum([
        'SALE_COMPLETED',
        'RETURN_COMPLETED',
        'SALE_CANCELLED',
      ]),
      saleId: z.uuid(),
      saleNumber: z.string(),
      returnId: z.uuid().nullable(),
      returnNumber: z.string().nullable(),
      occurredAt: z.string(),
      attributedUserName: z.string(),
      channelCode: z.string().nullable(),
      channelName: z.string().nullable(),
      paymentMethod: z.enum(['CASH', 'BANK_TRANSFER']).nullable(),
      grossSales: money,
      netRevenue: money,
      netCogs: money,
      grossProfit: money,
    }),
  ),
  nextCursor: z.object({ occurredAt: z.string(), id: z.uuid() }).nullable(),
});

export type RevenueReport = z.infer<typeof revenueSchema>;
export type OperationalDashboard = z.infer<typeof operationalSchema>;
export type OwnerDashboard = z.infer<typeof ownerDashboardSchema>;
export type ProfitPage = z.infer<typeof profitPageSchema>;

export function createReportsApi() {
  const client = getSupabaseClient();
  async function rpc(name: string, args: Record<string, unknown>) {
    const { data, error } = await client.rpc(name as never, args as never);
    if (error) throw new Error('Không thể kết nối máy chủ để tải báo cáo.');
    return data;
  }
  return {
    operational(from: string, to: string) {
      return rpc('get_operational_dashboard', { p_from: from, p_to: to }).then(
        (data) => parse(operationalSchema, data),
      );
    },
    mySummary(from: string, to: string) {
      return rpc('get_my_sales_summary', { p_from: from, p_to: to }).then(
        (data) => parse(revenueSchema, data),
      );
    },
    revenue(from: string, to: string, scope: 'OWN' | 'ALL') {
      return rpc('get_revenue_report', {
        p_from: from,
        p_to: to,
        p_scope: scope,
      }).then((data) => parse(revenueSchema, data));
    },
    owner(from: string, to: string) {
      return rpc('get_owner_dashboard', { p_from: from, p_to: to }).then(
        (data) => parse(ownerDashboardSchema, data),
      );
    },
    profit(
      from: string,
      to: string,
      cursor?: { occurredAt: string; id: string } | null,
    ) {
      return rpc('get_profit_report', {
        p_from: from,
        p_to: to,
        p_cursor_occurred_at: cursor?.occurredAt ?? null,
        p_cursor_id: cursor?.id ?? null,
        p_limit: 50,
      }).then((data) => parse(profitPageSchema, data));
    },
  };
}
