import { z } from 'zod';
import { getSupabaseClient } from '@/shared/supabase/client';
import { ConnectedExplorerApiError } from './connected-explorer-api';

const nonNegativeDecimalSchema = z
  .string()
  .regex(/^(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/);
const signedDecimalSchema = z
  .string()
  .regex(/^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/);
const dateTimeSchema = z.iso.datetime({ offset: true });
const commandErrorSchema = z
  .object({
    code: z.string().min(1).max(100),
    message: z.string().max(1000),
    details: z.record(z.string(), z.unknown()),
  })
  .strict();

function envelopeSchema<T extends z.ZodType>(data: T) {
  return z.discriminatedUnion('ok', [
    z
      .object({
        ok: z.literal(true),
        data,
        error: z.null(),
        correlationId: z.uuid(),
      })
      .strict(),
    z
      .object({
        ok: z.literal(false),
        data: z.null(),
        error: commandErrorSchema,
        correlationId: z.uuid(),
      })
      .strict(),
  ]);
}

const purchaseSummarySchema = z
  .object({
    orderCount: z.number().int().nonnegative(),
    cancelledOrderCount: z.number().int().nonnegative(),
    completedReturnCount: z.number().int().nonnegative(),
    completedSalesNet: nonNegativeDecimalSchema,
    returnedTotal: nonNegativeDecimalSchema,
    cancelledTotal: nonNegativeDecimalSchema,
    netSpend: signedDecimalSchema,
    lastPurchaseAt: dateTimeSchema.nullable(),
  })
  .strict();

const customerDetailSchema = z
  .object({
    id: z.uuid(),
    code: z.string().max(64).nullable(),
    customerType: z.enum(['INDIVIDUAL', 'BUSINESS']),
    name: z.string().min(1).max(200),
    phone: z
      .string()
      .regex(/^\+[1-9][0-9]{7,14}$/)
      .nullable(),
    email: z.string().max(254).nullable(),
    address: z.string().max(500).nullable(),
    companyName: z.string().max(200).nullable(),
    taxCode: z.string().max(32).nullable(),
    customerGroup: z.string().max(120).nullable(),
    notes: z.string().max(1000).nullable(),
    isActive: z.boolean(),
    version: z.number().int().positive(),
    salesScope: z.enum(['ALL', 'OWN', 'NONE']),
    purchaseSummary: purchaseSummarySchema.nullable(),
  })
  .strict()
  .superRefine((value, context) => {
    if ((value.salesScope === 'NONE') !== (value.purchaseSummary === null)) {
      context.addIssue({ code: 'custom', path: ['purchaseSummary'] });
    }
  });

const customerSaleItemSchema = z
  .object({
    saleId: z.uuid(),
    saleNumber: z.string().min(1),
    completedAt: dateTimeSchema,
    status: z.enum([
      'COMPLETED',
      'PARTIALLY_RETURNED',
      'RETURNED',
      'CANCELLED',
    ]),
    customerNameSnapshot: z.string().max(200).nullable(),
    channelName: z.string().min(1).max(120),
    createdByName: z.string().min(1).max(200),
    paymentMethod: z.enum(['CASH', 'BANK_TRANSFER', 'MIXED', 'CREDIT']),
    paymentStatus: z.enum(['CAPTURED', 'REVERSED']),
    originalNetTotal: nonNegativeDecimalSchema,
    returnedTotal: nonNegativeDecimalSchema,
    effectiveNetTotal: nonNegativeDecimalSchema,
  })
  .strict();
const customerSalesCursorSchema = z
  .object({ completedAt: dateTimeSchema, saleId: z.uuid() })
  .strict();
const customerSalesPageSchema = z
  .object({
    items: z.array(customerSaleItemSchema),
    nextCursor: customerSalesCursorSchema.nullable(),
  })
  .strict();

const customerReturnLineSchema = z
  .object({
    lineId: z.uuid(),
    productId: z.uuid(),
    sku: z.string().min(1).max(64),
    productName: z.string().min(1).max(200),
    unitName: z.string().min(1).max(50),
    acceptedQty: nonNegativeDecimalSchema,
    refundAmount: nonNegativeDecimalSchema,
  })
  .strict();
const customerReturnItemSchema = z
  .object({
    returnId: z.uuid(),
    returnNumber: z.string().min(1),
    completedAt: dateTimeSchema,
    reason: z.string().min(1).max(500),
    refundTotal: nonNegativeDecimalSchema,
    refundMethod: z.enum(['CASH', 'BANK_TRANSFER']),
    saleId: z.uuid(),
    saleNumber: z.string().min(1),
    lines: z.array(customerReturnLineSchema),
  })
  .strict();
const customerReturnsCursorSchema = z
  .object({ completedAt: dateTimeSchema, returnId: z.uuid() })
  .strict();
const customerReturnsPageSchema = z
  .object({
    items: z.array(customerReturnItemSchema),
    nextCursor: customerReturnsCursorSchema.nullable(),
  })
  .strict();

const customerProductItemSchema = z
  .object({
    productId: z.uuid(),
    sku: z.string().min(1).max(64),
    productName: z.string().min(1).max(200),
    unitName: z.string().min(1).max(50),
    productIsActive: z.boolean(),
    orderCount: z.number().int().nonnegative(),
    grossSoldQty: nonNegativeDecimalSchema,
    returnedQty: nonNegativeDecimalSchema,
    netPurchasedQty: nonNegativeDecimalSchema,
    grossNetAmount: nonNegativeDecimalSchema,
    refundedAmount: nonNegativeDecimalSchema,
    netPurchasedAmount: nonNegativeDecimalSchema,
    lastPurchasedAt: dateTimeSchema,
  })
  .strict();
const customerProductsCursorSchema = z
  .object({
    netPurchasedQty: nonNegativeDecimalSchema,
    lastPurchasedAt: dateTimeSchema,
    productId: z.uuid(),
  })
  .strict();
const customerProductsPageSchema = z
  .object({
    items: z.array(customerProductItemSchema),
    nextCursor: customerProductsCursorSchema.nullable(),
  })
  .strict();

function parseEnvelope<T>(
  schema: z.ZodType<T>,
  value: unknown,
  invalidMessage: string,
) {
  const parsed = envelopeSchema(schema).safeParse(value);
  if (!parsed.success) throw new Error(invalidMessage);
  if (!parsed.data.ok) {
    throw new ConnectedExplorerApiError(
      parsed.data.error.code,
      parsed.data.correlationId,
    );
  }
  return parsed.data.data;
}

export function parseCustomerDetailEnvelope(value: unknown) {
  return parseEnvelope(
    customerDetailSchema,
    value,
    'Phản hồi chi tiết khách hàng không hợp lệ.',
  );
}

export function parseCustomerSalesEnvelope(value: unknown) {
  return parseEnvelope(
    customerSalesPageSchema,
    value,
    'Phản hồi hóa đơn khách hàng không hợp lệ.',
  );
}

export function parseCustomerReturnsEnvelope(value: unknown) {
  return parseEnvelope(
    customerReturnsPageSchema,
    value,
    'Phản hồi phiếu trả khách hàng không hợp lệ.',
  );
}

export function parseCustomerProductsEnvelope(value: unknown) {
  return parseEnvelope(
    customerProductsPageSchema,
    value,
    'Phản hồi sản phẩm khách hàng không hợp lệ.',
  );
}

export type CustomerSalesScope = z.infer<
  typeof customerDetailSchema
>['salesScope'];
export type CustomerPurchaseSummary = z.infer<typeof purchaseSummarySchema>;
export type CustomerDetail = z.infer<typeof customerDetailSchema>;
export type CustomerSaleItem = z.infer<typeof customerSaleItemSchema>;
export type CustomerSalesCursor = z.infer<typeof customerSalesCursorSchema>;
export type CustomerSalesPage = z.infer<typeof customerSalesPageSchema>;
export type CustomerReturnItem = z.infer<typeof customerReturnItemSchema>;
export type CustomerReturnsCursor = z.infer<typeof customerReturnsCursorSchema>;
export type CustomerReturnsPage = z.infer<typeof customerReturnsPageSchema>;
export type CustomerProductItem = z.infer<typeof customerProductItemSchema>;
export type CustomerProductsCursor = z.infer<
  typeof customerProductsCursorSchema
>;
export type CustomerProductsPage = z.infer<typeof customerProductsPageSchema>;

export interface CustomerExplorerApi {
  customerDetail(input: {
    customerId: string;
    from?: string;
    to?: string;
  }): Promise<CustomerDetail>;
  customerSales(input: {
    customerId: string;
    from?: string;
    to?: string;
    cursor?: CustomerSalesCursor;
    limit?: number;
  }): Promise<CustomerSalesPage>;
  customerReturns(input: {
    customerId: string;
    from?: string;
    to?: string;
    cursor?: CustomerReturnsCursor;
    limit?: number;
  }): Promise<CustomerReturnsPage>;
  customerProducts(input: {
    customerId: string;
    search?: string;
    from?: string;
    to?: string;
    cursor?: CustomerProductsCursor;
    limit?: number;
  }): Promise<CustomerProductsPage>;
}

function transportFailure() {
  return new Error('Không thể kết nối máy chủ. Vui lòng thử lại.');
}

export function createCustomerExplorerApi(): CustomerExplorerApi {
  const client = getSupabaseClient();
  return {
    async customerDetail(input) {
      const { data, error } = await client.rpc('get_customer_detail', {
        p_customer_id: input.customerId,
        p_from: input.from,
        p_to: input.to,
      });
      if (error) throw transportFailure();
      return parseCustomerDetailEnvelope(data);
    },
    async customerSales(input) {
      const { data, error } = await client.rpc('list_customer_sales', {
        p_customer_id: input.customerId,
        p_from: input.from,
        p_to: input.to,
        p_cursor_completed_at: input.cursor?.completedAt,
        p_cursor_sale_id: input.cursor?.saleId,
        p_limit: input.limit ?? 25,
      });
      if (error) throw transportFailure();
      return parseCustomerSalesEnvelope(data);
    },
    async customerReturns(input) {
      const { data, error } = await client.rpc('list_customer_returns', {
        p_customer_id: input.customerId,
        p_from: input.from,
        p_to: input.to,
        p_cursor_completed_at: input.cursor?.completedAt,
        p_cursor_return_id: input.cursor?.returnId,
        p_limit: input.limit ?? 25,
      });
      if (error) throw transportFailure();
      return parseCustomerReturnsEnvelope(data);
    },
    async customerProducts(input) {
      const { data, error } = await client.rpc('list_customer_products', {
        p_customer_id: input.customerId,
        p_search: input.search,
        p_from: input.from,
        p_to: input.to,
        p_cursor_net_purchased_qty: input.cursor?.netPurchasedQty,
        p_cursor_last_purchased_at: input.cursor?.lastPurchasedAt,
        p_cursor_product_id: input.cursor?.productId,
        p_limit: input.limit ?? 25,
      });
      if (error) throw transportFailure();
      return parseCustomerProductsEnvelope(data);
    },
  };
}

export const customerExplorerKeys = {
  all: ['connected-explorer'] as const,
  detail: (input: object) =>
    ['connected-explorer', 'customer-detail', input] as const,
  sales: (input: object) =>
    ['connected-explorer', 'customer-sales', input] as const,
  returns: (input: object) =>
    ['connected-explorer', 'customer-returns', input] as const,
  products: (input: object) =>
    ['connected-explorer', 'customer-products', input] as const,
};

export { ConnectedExplorerApiError };
