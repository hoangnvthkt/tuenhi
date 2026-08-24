import { z } from 'zod';
import { getBusinessErrorMessage } from '@/shared/api/command-error';
import { getSupabaseClient } from '@/shared/supabase/client';
import type {
  CustomerFormValues,
  SalesChannelFormValues,
  SupplierFormValues,
} from './directory-validation';

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

const commonItemShape = {
  id: z.uuid(),
  code: z.string().max(64).nullable(),
  name: z.string().min(1).max(200),
  phone: z
    .string()
    .regex(/^\+[1-9][0-9]{7,14}$/)
    .nullable(),
  email: z.string().max(254).nullable(),
  address: z.string().max(500).nullable(),
  notes: z.string().max(1000).nullable(),
  isActive: z.boolean(),
  version: z.number().int().positive(),
};

const supplierSchema = z.object(commonItemShape).strict();
const customerSchema = z
  .object({
    ...commonItemShape,
    customerType: z.enum(['INDIVIDUAL', 'BUSINESS']),
    companyName: z.string().max(200).nullable(),
    taxCode: z.string().max(32).nullable(),
    customerGroup: z.string().max(120).nullable(),
  })
  .strict();
const salesChannelSchema = z
  .object({
    id: z.uuid(),
    code: z.string().regex(/^[A-Z][A-Z0-9_]{1,31}$/),
    name: z.string().min(1).max(120),
    sortOrder: z.number().int().nonnegative(),
    isActive: z.boolean(),
    version: z.number().int().positive(),
  })
  .strict();

const supplierEnvelope = envelopeSchema(
  z.object({ items: z.array(supplierSchema) }).strict(),
);
const customerEnvelope = envelopeSchema(
  z.object({ items: z.array(customerSchema) }).strict(),
);
const channelEnvelope = envelopeSchema(
  z.object({ items: z.array(salesChannelSchema) }).strict(),
);
const mutationEnvelope = envelopeSchema(z.record(z.string(), z.unknown()));

export type SupplierItem = z.infer<typeof supplierSchema>;
export type CustomerItem = z.infer<typeof customerSchema>;
export type SalesChannelItem = z.infer<typeof salesChannelSchema>;
export type DirectoryCursor = { name: string; id: string };
export type DirectoryPage<T> = {
  items: T[];
  nextCursor: DirectoryCursor | null;
};

export class DirectoryApiError extends Error {
  constructor(
    readonly code: string,
    readonly correlationId: string,
    readonly details: Record<string, unknown>,
  ) {
    super(getBusinessErrorMessage(code));
    this.name = 'DirectoryApiError';
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
    throw new DirectoryApiError(
      envelope.error.code,
      envelope.correlationId,
      envelope.error.details,
    );
  }
  return envelope.data;
}

function normalizedName(value: string) {
  return value.normalize('NFC').trim().replace(/\s+/g, ' ').toLowerCase();
}

function withCursor<T extends { id: string; name: string }>(
  items: T[],
  limit: number,
): DirectoryPage<T> {
  const last = items.at(-1);
  return {
    items,
    nextCursor:
      items.length === limit && last
        ? { name: normalizedName(last.name), id: last.id }
        : null,
  };
}

export function parseSupplierPage(value: unknown, limit: number) {
  const parsed = supplierEnvelope.safeParse(value);
  if (!parsed.success) throw new Error('Phản hồi nhà cung cấp không hợp lệ.');
  return withCursor(unwrap(parsed.data).items, limit);
}

export function parseCustomerPage(value: unknown, limit: number) {
  const parsed = customerEnvelope.safeParse(value);
  if (!parsed.success) throw new Error('Phản hồi khách hàng không hợp lệ.');
  return withCursor(unwrap(parsed.data).items, limit);
}

function parseChannels(value: unknown) {
  const parsed = channelEnvelope.safeParse(value);
  if (!parsed.success) throw new Error('Phản hồi kênh bán không hợp lệ.');
  return unwrap(parsed.data).items;
}

function parseMutation(value: unknown) {
  const parsed = mutationEnvelope.safeParse(value);
  if (!parsed.success) throw new Error('Phản hồi thao tác không hợp lệ.');
  return unwrap(parsed.data);
}

export interface DirectoryApi {
  listSuppliers(input: {
    search?: string;
    cursor?: DirectoryCursor;
    limit?: number;
  }): Promise<DirectoryPage<SupplierItem>>;
  listCustomers(input: {
    search?: string;
    cursor?: DirectoryCursor;
    limit?: number;
  }): Promise<DirectoryPage<CustomerItem>>;
  listSalesChannels(includeInactive?: boolean): Promise<SalesChannelItem[]>;
  saveSupplier(input: {
    supplierId?: string;
    expectedVersion?: number;
    values: SupplierFormValues;
    idempotencyKey: string;
  }): Promise<{ supplierId: string; version: number }>;
  saveCustomer(input: {
    customerId?: string;
    expectedVersion?: number;
    values: CustomerFormValues;
    idempotencyKey: string;
  }): Promise<{ customerId: string; version: number }>;
  saveSalesChannel(input: {
    channelId?: string;
    values: SalesChannelFormValues;
    idempotencyKey: string;
  }): Promise<{ channelId: string }>;
}

function transportFailure() {
  return new Error(
    'Không thể kết nối máy chủ. Kết quả thao tác có thể chưa xác định.',
  );
}

function rpcNullable<T>(value: T | undefined): T {
  return (value ?? null) as T;
}

export function createDirectoryApi(): DirectoryApi {
  const client = getSupabaseClient();
  return {
    async listSuppliers(input) {
      const limit = input.limit ?? 30;
      const { data, error } = await client.rpc('list_suppliers', {
        p_search: input.search || undefined,
        p_cursor_name: input.cursor?.name,
        p_cursor_id: input.cursor?.id,
        p_limit: limit,
      });
      if (error) throw transportFailure();
      return parseSupplierPage(data, limit);
    },
    async listCustomers(input) {
      const limit = input.limit ?? 30;
      const { data, error } = await client.rpc('list_customers', {
        p_search: input.search || undefined,
        p_cursor_name: input.cursor?.name,
        p_cursor_id: input.cursor?.id,
        p_limit: limit,
      });
      if (error) throw transportFailure();
      return parseCustomerPage(data, limit);
    },
    async listSalesChannels(includeInactive = false) {
      const { data, error } = await client.rpc('list_sales_channels', {
        p_include_inactive: includeInactive,
      });
      if (error) throw transportFailure();
      return parseChannels(data);
    },
    async saveSupplier(input) {
      const { data, error } = await client.rpc('save_supplier', {
        p_supplier_id: rpcNullable(input.supplierId),
        p_expected_version: rpcNullable(input.expectedVersion),
        p_supplier: input.values,
        p_idempotency_key: input.idempotencyKey,
      });
      if (error) throw transportFailure();
      return z
        .object({ supplierId: z.uuid(), version: z.number().int().positive() })
        .parse(parseMutation(data));
    },
    async saveCustomer(input) {
      const { data, error } = await client.rpc('save_customer', {
        p_customer_id: rpcNullable(input.customerId),
        p_expected_version: rpcNullable(input.expectedVersion),
        p_customer: input.values,
        p_idempotency_key: input.idempotencyKey,
      });
      if (error) throw transportFailure();
      return z
        .object({ customerId: z.uuid(), version: z.number().int().positive() })
        .parse(parseMutation(data));
    },
    async saveSalesChannel(input) {
      const { data, error } = await client.rpc('save_sales_channel', {
        p_channel_id: rpcNullable(input.channelId),
        p_code: input.values.code,
        p_name: input.values.name,
        p_sort_order: Number(input.values.sortOrder),
        p_is_active: input.values.isActive,
        p_idempotency_key: input.idempotencyKey,
      });
      if (error) throw transportFailure();
      return z.object({ channelId: z.uuid() }).parse(parseMutation(data));
    },
  };
}

export const directoryKeys = {
  all: ['directories'] as const,
  suppliers: (input: object) => ['directories', 'suppliers', input] as const,
  customers: (input: object) => ['directories', 'customers', input] as const,
  channels: (includeInactive: boolean) =>
    ['directories', 'channels', { includeInactive }] as const,
};
