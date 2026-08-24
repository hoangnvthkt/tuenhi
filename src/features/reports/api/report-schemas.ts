import { z } from 'zod';

const decimal = z.string();
const summarySchema = z.object({
  completedOrderCount: z.number().int().nonnegative(),
  soldQuantity: decimal,
  grossSales: decimal,
  lineDiscounts: decimal,
  orderDiscounts: decimal,
  salesReturns: decimal,
  cancellations: decimal,
  netRevenue: decimal,
  averageOrderValue: decimal.nullable(),
});

export const revenueReportSchema = z.object({
  version: z.literal(1),
  timezone: z.literal('Asia/Ho_Chi_Minh'),
  range: z.object({ from: z.string(), to: z.string() }),
  generatedAt: z.string(),
  scope: z.enum(['OWN', 'ALL']).optional(),
  summary: summarySchema,
  daily: z.array(
    summarySchema.omit({ averageOrderValue: true }).extend({ day: z.string() }),
  ),
  channels: z.array(
    z.object({
      code: z.string(),
      name: z.string(),
      completedOrderCount: z.number().int(),
      grossSales: decimal,
      netRevenue: decimal,
    }),
  ),
  paymentMethods: z.array(
    z.object({
      method: z.string(),
      completedOrderCount: z.number().int(),
      grossSales: decimal,
      netRevenue: decimal,
    }),
  ),
});

export const operationalDashboardSchema = z.object({
  version: z.literal(1),
  timezone: z.literal('Asia/Ho_Chi_Minh'),
  catalog: z.object({
    activeProductCount: z.number().int(),
    lowStockCount: z.number().int(),
    outOfStockCount: z.number().int(),
    totalOnHandQty: decimal,
  }),
  pending: z.object({
    purchaseReceipts: z.number().int(),
    stockCounts: z.number().int(),
    saleReturns: z.number().int(),
  }),
});

export const ownerDashboardSchema = z.object({
  version: z.literal(1),
  netRevenue: decimal,
  netCogs: decimal,
  grossProfit: decimal,
  grossMarginPct: decimal.nullable(),
  inventoryValue: decimal,
});

export const profitPageSchema = z.object({
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
      grossSales: decimal,
      netRevenue: decimal,
      netCogs: decimal,
      grossProfit: decimal,
    }),
  ),
  nextCursor: z.object({ occurredAt: z.string(), id: z.uuid() }).nullable(),
});

export type RevenueReport = z.infer<typeof revenueReportSchema>;
export type OperationalDashboard = z.infer<typeof operationalDashboardSchema>;
export type OwnerDashboard = z.infer<typeof ownerDashboardSchema>;
export type ProfitPage = z.infer<typeof profitPageSchema>;
