import { z } from 'zod';
import { getBusinessErrorMessage } from '@/shared/api/command-error';
import { getSupabaseClient } from '@/shared/supabase/client';

const canonicalDecimalSchema = z
  .string()
  .regex(/^(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/);
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

const productRelationshipContextSchema = z
  .object({
    productId: z.uuid(),
    supplierCount: z.number().int().nonnegative(),
    postedReceiptCount: z.number().int().nonnegative(),
    totalReceivedQty: canonicalDecimalSchema,
    lastReceivedAt: dateTimeSchema.nullable(),
    latestUnitCost: canonicalDecimalSchema.nullable(),
    canReadCost: z.boolean(),
  })
  .strict()
  .superRefine((value, context) => {
    if (!value.canReadCost && value.latestUnitCost !== null) {
      context.addIssue({ code: 'custom', path: ['latestUnitCost'] });
    }
  });

const productSupplierItemSchema = z
  .object({
    supplierId: z.uuid(),
    supplierCode: z.string().max(64).nullable(),
    supplierName: z.string().min(1).max(200),
    supplierIsActive: z.boolean(),
    postedReceiptCount: z.number().int().nonnegative(),
    totalReceivedQty: canonicalDecimalSchema,
    lastReceivedAt: dateTimeSchema,
    latestReceiptId: z.uuid(),
    latestReceiptNumber: z.string().min(1).nullable(),
    latestUnitCost: canonicalDecimalSchema.nullable(),
    canReadCost: z.boolean(),
  })
  .strict()
  .superRefine((value, context) => {
    if (!value.canReadCost && value.latestUnitCost !== null) {
      context.addIssue({ code: 'custom', path: ['latestUnitCost'] });
    }
  });

const relationshipCursorSchema = z
  .object({ lastReceivedAt: dateTimeSchema })
  .strict();
const productSupplierCursorSchema = relationshipCursorSchema
  .extend({ supplierId: z.uuid() })
  .strict();
const supplierProductCursorSchema = relationshipCursorSchema
  .extend({ productId: z.uuid() })
  .strict();

const productSuppliersPageSchema = z
  .object({
    items: z.array(productSupplierItemSchema),
    nextCursor: productSupplierCursorSchema.nullable(),
  })
  .strict();

const supplierDetailSchema = z
  .object({
    id: z.uuid(),
    code: z.string().max(64).nullable(),
    name: z.string().min(1).max(200),
    phone: z.string().max(32).nullable(),
    email: z.string().max(254).nullable(),
    address: z.string().max(500).nullable(),
    notes: z.string().max(1000).nullable(),
    isActive: z.boolean(),
    version: z.number().int().positive(),
    canReadPurchases: z.boolean(),
    canReadCost: z.boolean(),
    distinctProductCount: z.number().int().nonnegative().nullable(),
    postedReceiptCount: z.number().int().nonnegative().nullable(),
    totalReceivedQty: canonicalDecimalSchema.nullable(),
    lastReceivedAt: dateTimeSchema.nullable(),
    totalPostedCost: canonicalDecimalSchema.nullable(),
  })
  .strict()
  .superRefine((value, context) => {
    const purchaseValues = [
      value.distinctProductCount,
      value.postedReceiptCount,
      value.totalReceivedQty,
      value.lastReceivedAt,
    ];
    if (
      !value.canReadPurchases &&
      purchaseValues.some((item) => item !== null)
    ) {
      context.addIssue({ code: 'custom', path: ['canReadPurchases'] });
    }
    if (!value.canReadCost && value.totalPostedCost !== null) {
      context.addIssue({ code: 'custom', path: ['totalPostedCost'] });
    }
  });

const supplierProductItemSchema = z
  .object({
    productId: z.uuid(),
    sku: z.string().min(1).max(64),
    productName: z.string().min(1).max(200),
    unitName: z.string().min(1).max(50),
    isActive: z.boolean(),
    postedReceiptCount: z.number().int().nonnegative(),
    totalReceivedQty: canonicalDecimalSchema,
    lastReceivedAt: dateTimeSchema,
    latestReceiptId: z.uuid(),
    latestReceiptNumber: z.string().min(1).nullable(),
    latestUnitCost: canonicalDecimalSchema.nullable(),
    canReadCost: z.boolean(),
  })
  .strict()
  .superRefine((value, context) => {
    if (!value.canReadCost && value.latestUnitCost !== null) {
      context.addIssue({ code: 'custom', path: ['latestUnitCost'] });
    }
  });

const supplierProductsPageSchema = z
  .object({
    items: z.array(supplierProductItemSchema),
    nextCursor: supplierProductCursorSchema.nullable(),
  })
  .strict();

const purchaseHistoryItemSchema = z
  .object({
    lineId: z.uuid(),
    receiptId: z.uuid(),
    receiptNumber: z.string().min(1),
    receivedAt: dateTimeSchema,
    supplierId: z.uuid().nullable(),
    supplierName: z.string().max(200).nullable(),
    productId: z.uuid(),
    sku: z.string().min(1).max(64),
    productName: z.string().min(1).max(200),
    unitName: z.string().min(1).max(50),
    receivedQty: canonicalDecimalSchema,
    unitCost: canonicalDecimalSchema.nullable(),
    lineCost: canonicalDecimalSchema.nullable(),
    canReadCost: z.boolean(),
  })
  .strict()
  .superRefine((value, context) => {
    if (
      !value.canReadCost &&
      (value.unitCost !== null || value.lineCost !== null)
    ) {
      context.addIssue({ code: 'custom', path: ['canReadCost'] });
    }
  });
const purchaseHistoryCursorSchema = z
  .object({
    receivedAt: dateTimeSchema,
    receiptId: z.uuid(),
    lineId: z.uuid(),
  })
  .strict();
const postedPurchaseHistoryPageSchema = z
  .object({
    items: z.array(purchaseHistoryItemSchema),
    nextCursor: purchaseHistoryCursorSchema.nullable(),
  })
  .strict();

export type ProductRelationshipContext = z.infer<
  typeof productRelationshipContextSchema
>;
export type ProductSupplierItem = z.infer<typeof productSupplierItemSchema>;
export type ProductSupplierCursor = z.infer<typeof productSupplierCursorSchema>;
export type ProductSuppliersPage = z.infer<typeof productSuppliersPageSchema>;
export type SupplierDetail = z.infer<typeof supplierDetailSchema>;
export type SupplierProductItem = z.infer<typeof supplierProductItemSchema>;
export type SupplierProductCursor = z.infer<typeof supplierProductCursorSchema>;
export type SupplierProductsPage = z.infer<typeof supplierProductsPageSchema>;
export type PurchaseHistoryItem = z.infer<typeof purchaseHistoryItemSchema>;
export type PurchaseHistoryCursor = z.infer<typeof purchaseHistoryCursorSchema>;
export type PostedPurchaseHistoryPage = z.infer<
  typeof postedPurchaseHistoryPageSchema
>;

export class ConnectedExplorerApiError extends Error {
  constructor(
    readonly code: string,
    readonly correlationId: string,
  ) {
    super(getBusinessErrorMessage(code));
    this.name = 'ConnectedExplorerApiError';
  }
}

function unwrap<T>(
  envelope:
    | { ok: true; data: T; correlationId: string }
    | {
        ok: false;
        data: null;
        error: z.infer<typeof commandErrorSchema>;
        correlationId: string;
      },
) {
  if (!envelope.ok) {
    throw new ConnectedExplorerApiError(
      envelope.error.code,
      envelope.correlationId,
    );
  }
  return envelope.data;
}

function parseEnvelope<T>(
  schema: z.ZodType<T>,
  value: unknown,
  invalidMessage: string,
) {
  const parsed = envelopeSchema(schema).safeParse(value);
  if (!parsed.success) throw new Error(invalidMessage);
  return unwrap(parsed.data);
}

export function parseProductRelationshipContextEnvelope(value: unknown) {
  return parseEnvelope(
    productRelationshipContextSchema,
    value,
    'Phản hồi liên kết sản phẩm không hợp lệ.',
  );
}

export function parseProductSuppliersEnvelope(value: unknown) {
  return parseEnvelope(
    productSuppliersPageSchema,
    value,
    'Phản hồi Nhà cung cấp của sản phẩm không hợp lệ.',
  );
}

export function parseSupplierDetailEnvelope(value: unknown) {
  return parseEnvelope(
    supplierDetailSchema,
    value,
    'Phản hồi chi tiết Nhà cung cấp không hợp lệ.',
  );
}

export function parseSupplierProductsEnvelope(value: unknown) {
  return parseEnvelope(
    supplierProductsPageSchema,
    value,
    'Phản hồi mặt hàng của Nhà cung cấp không hợp lệ.',
  );
}

export function parsePostedPurchaseHistoryEnvelope(value: unknown) {
  return parseEnvelope(
    postedPurchaseHistoryPageSchema,
    value,
    'Phản hồi lịch sử nhập hàng không hợp lệ.',
  );
}

function transportFailure() {
  return new Error('Không thể kết nối máy chủ. Vui lòng thử lại.');
}

export interface ConnectedExplorerApi {
  productContext(productId: string): Promise<ProductRelationshipContext>;
  productSuppliers(input: {
    productId: string;
    cursor?: ProductSupplierCursor;
    limit?: number;
  }): Promise<ProductSuppliersPage>;
  supplierDetail(supplierId: string): Promise<SupplierDetail>;
  supplierProducts(input: {
    supplierId: string;
    search?: string;
    cursor?: SupplierProductCursor;
    limit?: number;
  }): Promise<SupplierProductsPage>;
  postedPurchaseHistory(input: {
    productId?: string;
    supplierId?: string;
    from?: string;
    to?: string;
    cursor?: PurchaseHistoryCursor;
    limit?: number;
  }): Promise<PostedPurchaseHistoryPage>;
}

export function createConnectedExplorerApi(): ConnectedExplorerApi {
  const client = getSupabaseClient();
  return {
    async productContext(productId) {
      const { data, error } = await client.rpc(
        'get_product_relationship_context',
        { p_product_id: productId },
      );
      if (error) throw transportFailure();
      return parseProductRelationshipContextEnvelope(data);
    },
    async productSuppliers(input) {
      const { data, error } = await client.rpc('list_product_suppliers', {
        p_product_id: input.productId,
        p_cursor_last_received_at: input.cursor?.lastReceivedAt,
        p_cursor_supplier_id: input.cursor?.supplierId,
        p_limit: input.limit ?? 25,
      });
      if (error) throw transportFailure();
      return parseProductSuppliersEnvelope(data);
    },
    async supplierDetail(supplierId) {
      const { data, error } = await client.rpc('get_supplier_detail', {
        p_supplier_id: supplierId,
      });
      if (error) throw transportFailure();
      return parseSupplierDetailEnvelope(data);
    },
    async supplierProducts(input) {
      const { data, error } = await client.rpc('list_supplier_products', {
        p_supplier_id: input.supplierId,
        p_search: input.search || undefined,
        p_cursor_last_received_at: input.cursor?.lastReceivedAt,
        p_cursor_product_id: input.cursor?.productId,
        p_limit: input.limit ?? 25,
      });
      if (error) throw transportFailure();
      return parseSupplierProductsEnvelope(data);
    },
    async postedPurchaseHistory(input) {
      const { data, error } = await client.rpc('list_posted_purchase_history', {
        p_product_id: input.productId,
        p_supplier_id: input.supplierId,
        p_from: input.from,
        p_to: input.to,
        p_cursor_received_at: input.cursor?.receivedAt,
        p_cursor_receipt_id: input.cursor?.receiptId,
        p_cursor_line_id: input.cursor?.lineId,
        p_limit: input.limit ?? 25,
      });
      if (error) throw transportFailure();
      return parsePostedPurchaseHistoryEnvelope(data);
    },
  };
}

export const connectedExplorerKeys = {
  all: ['connected-explorer'] as const,
  productContext: (productId: string) =>
    ['connected-explorer', 'product-context', productId] as const,
  productSuppliers: (input: object) =>
    ['connected-explorer', 'product-suppliers', input] as const,
  supplierDetail: (supplierId: string) =>
    ['connected-explorer', 'supplier-detail', supplierId] as const,
  supplierProducts: (input: object) =>
    ['connected-explorer', 'supplier-products', input] as const,
  purchaseHistory: (input: object) =>
    ['connected-explorer', 'purchase-history', input] as const,
};
