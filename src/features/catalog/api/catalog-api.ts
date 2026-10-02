import { z } from 'zod';
import { getBusinessErrorMessage } from '@/shared/api/command-error';
import { INTEGER_FINAL } from '@/shared/lib/numeric/canonical-number';
import { getSupabaseClient } from '@/shared/supabase/client';
import type {
  CatalogCursor,
  CatalogPage,
  CatalogStockState,
  CategoryOption,
  ProductDetail,
  ProductFormValues,
} from '../model/catalog-types';

const commandErrorSchema = z.object({
  code: z.string().min(1).max(100),
  message: z.string().max(1000),
  details: z.record(z.string(), z.unknown()),
});

function envelopeSchema<T extends z.ZodType>(data: T) {
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
      error: commandErrorSchema,
      correlationId: z.uuid(),
    }),
  ]);
}

const catalogItemSchema = z.object({
  id: z.uuid(),
  sku: z.string().min(1).max(64),
  barcode: z.string().max(64).nullable(),
  name: z.string().min(1).max(200),
  categoryId: z.uuid().nullable(),
  categoryName: z.string().max(120).nullable(),
  unitName: z.string().min(1).max(50),
  minStockQty: z.string().regex(INTEGER_FINAL),
  effectiveMinStockQty: z.string().regex(INTEGER_FINAL).optional(),
  isActive: z.boolean(),
  version: z.number().int().positive(),
  primaryImagePath: z.string().max(500).nullable(),
  currentSalePrice: z.string().nullable(),
  onHandQty: z.string().regex(INTEGER_FINAL),
});

const cursorSchema = z.object({ name: z.string(), id: z.uuid() });
const catalogPageSchema = z.object({
  items: z.array(catalogItemSchema),
  nextCursor: cursorSchema.nullable(),
});
const catalogPageEnvelopeSchema = envelopeSchema(catalogPageSchema);

const productDetailSchema = catalogItemSchema.extend({
  description: z.string().max(2000).nullable(),
  salePriceValidFrom: z.iso.datetime({ offset: true }).nullable(),
  images: z.array(
    z.object({
      id: z.uuid(),
      objectPath: z.string().min(1).max(500),
      sortOrder: z.number().int().nonnegative(),
      isPrimary: z.boolean(),
    }),
  ),
});
const productDetailEnvelopeSchema = envelopeSchema(productDetailSchema);

const categorySchema = z.object({
  id: z.uuid(),
  name: z.string().min(1).max(120),
  isActive: z.boolean(),
});
const categoriesEnvelopeSchema = envelopeSchema(
  z.object({ items: z.array(categorySchema) }),
);

const priceHistoryItemSchema = z.object({
  id: z.uuid(),
  salePrice: z.string(),
  validFrom: z.iso.datetime({ offset: true }),
  validTo: z.iso.datetime({ offset: true }).nullable(),
  changedBy: z.uuid(),
  changeReason: z.string().nullable(),
});
const priceHistoryEnvelopeSchema = envelopeSchema(
  z.object({ items: z.array(priceHistoryItemSchema) }),
);

const mutationEnvelopeSchema = envelopeSchema(
  z.record(z.string(), z.unknown()),
);

export class CatalogApiError extends Error {
  constructor(
    readonly code: string,
    readonly correlationId: string,
    readonly details: Record<string, unknown>,
  ) {
    super(getBusinessErrorMessage(code));
    this.name = 'CatalogApiError';
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
    throw new CatalogApiError(
      envelope.error.code,
      envelope.correlationId,
      envelope.error.details,
    );
  }
  return envelope.data;
}

export function parseCatalogPageEnvelope(value: unknown): CatalogPage {
  const parsed = catalogPageEnvelopeSchema.safeParse(value);
  if (!parsed.success) throw new Error('Phản hồi danh mục không hợp lệ.');
  return unwrap(parsed.data);
}

export function parseMutationEnvelope(value: unknown) {
  const parsed = mutationEnvelopeSchema.safeParse(value);
  if (!parsed.success) throw new Error('Phản hồi thao tác không hợp lệ.');
  return unwrap(parsed.data);
}

export type PriceHistoryItem = z.infer<typeof priceHistoryItemSchema>;

export interface CatalogApi {
  list(input: {
    search?: string;
    categoryId?: string;
    stockState?: CatalogStockState;
    includeInactive?: boolean;
    cursor?: CatalogCursor;
    limit?: number;
  }): Promise<CatalogPage>;
  detail(productId: string): Promise<ProductDetail>;
  listCategories(includeInactive?: boolean): Promise<CategoryOption[]>;
  priceHistory(productId: string): Promise<PriceHistoryItem[]>;
  saveProduct(input: {
    productId?: string;
    expectedVersion?: number;
    values: Omit<ProductFormValues, 'salePrice'>;
    idempotencyKey: string;
  }): Promise<{ productId: string; version: number }>;
  setSalePrice(input: {
    productId: string;
    salePrice: string;
    changeReason: string;
    idempotencyKey: string;
  }): Promise<void>;
  saveCategory(input: {
    categoryId?: string;
    name: string;
    isActive: boolean;
    idempotencyKey: string;
  }): Promise<void>;
}

function transportFailure() {
  return new Error(
    'Không thể kết nối máy chủ. Kết quả thao tác có thể chưa xác định.',
  );
}

function rpcNullable<T>(value: T | undefined): T {
  return (value ?? null) as T;
}

export function createCatalogApi(): CatalogApi {
  const client = getSupabaseClient();

  return {
    async list(input) {
      const { data, error } = await client.rpc('get_product_catalog', {
        p_search: input.search || undefined,
        p_category_id: input.categoryId || undefined,
        p_stock_state: input.stockState ?? 'ALL',
        p_include_inactive: input.includeInactive ?? false,
        p_cursor_name: input.cursor?.name,
        p_cursor_id: input.cursor?.id,
        p_limit: input.limit ?? 30,
      });
      if (error) throw transportFailure();
      return parseCatalogPageEnvelope(data);
    },

    async detail(productId) {
      const { data, error } = await client.rpc('get_product_detail', {
        p_product_id: productId,
      });
      if (error) throw transportFailure();
      const parsed = productDetailEnvelopeSchema.safeParse(data);
      if (!parsed.success) throw new Error('Phản hồi sản phẩm không hợp lệ.');
      return unwrap(parsed.data);
    },

    async listCategories(includeInactive = false) {
      const { data, error } = await client.rpc('list_categories', {
        p_include_inactive: includeInactive,
      });
      if (error) throw transportFailure();
      const parsed = categoriesEnvelopeSchema.safeParse(data);
      if (!parsed.success) throw new Error('Phản hồi nhóm hàng không hợp lệ.');
      return unwrap(parsed.data).items;
    },

    async priceHistory(productId) {
      const { data, error } = await client.rpc(
        'get_product_sale_price_history',
        { p_product_id: productId, p_limit: 50 },
      );
      if (error) throw transportFailure();
      const parsed = priceHistoryEnvelopeSchema.safeParse(data);
      if (!parsed.success)
        throw new Error('Phản hồi lịch sử giá không hợp lệ.');
      return unwrap(parsed.data).items;
    },

    async saveProduct(input) {
      const { data, error } = await client.rpc('save_product', {
        p_product_id: rpcNullable(input.productId),
        p_expected_version: rpcNullable(input.expectedVersion),
        p_product: {
          sku: input.values.sku,
          barcode: input.values.barcode,
          name: input.values.name,
          categoryId: input.values.categoryId,
          unitName: input.values.unitName,
          description: input.values.description,
          minStockQty: input.values.minStockQty,
          isActive: input.values.isActive,
        },
        p_idempotency_key: input.idempotencyKey,
      });
      if (error) throw transportFailure();
      const result = parseMutationEnvelope(data);
      return z
        .object({ productId: z.uuid(), version: z.number().int().positive() })
        .parse(result);
    },

    async setSalePrice(input) {
      const { data, error } = await client.rpc('set_product_sale_price', {
        p_product_id: input.productId,
        p_sale_price: input.salePrice,
        p_change_reason: input.changeReason,
        p_idempotency_key: input.idempotencyKey,
      });
      if (error) throw transportFailure();
      parseMutationEnvelope(data);
    },

    async saveCategory(input) {
      const { data, error } = await client.rpc('save_category', {
        p_category_id: rpcNullable(input.categoryId),
        p_name: input.name,
        p_is_active: input.isActive,
        p_idempotency_key: input.idempotencyKey,
      });
      if (error) throw transportFailure();
      parseMutationEnvelope(data);
    },
  };
}

export const catalogKeys = {
  all: ['catalog'] as const,
  list: (filters: object) => ['catalog', 'list', filters] as const,
  detail: (productId: string) => ['catalog', 'detail', productId] as const,
  categories: (includeInactive: boolean) =>
    ['catalog', 'categories', { includeInactive }] as const,
  priceHistory: (productId: string) =>
    ['catalog', 'price-history', productId] as const,
};
