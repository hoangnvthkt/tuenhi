import { z } from 'zod';
import { getBusinessErrorMessage } from '@/shared/api/command-error';
import { parseRpcEnvelope } from '@/shared/api/rpc-envelope';
import { getSupabaseClient } from '@/shared/supabase/client';
import type { SalesChannelFormValues } from '../model/settings-validation';

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

const storeSettingsSchema = z
  .object({
    displayName: z.string(),
    logoPath: z.string().nullable(),
    address: z.string().nullable(),
    contactPhone: z.string().nullable(),
    zalo: z.string().nullable(),
    invoiceFooter: z.string().nullable(),
    version: z.number().int(),
  })
  .strict();

export type SalesChannelItem = z.infer<typeof salesChannelSchema>;
export type StoreSettings = z.infer<typeof storeSettingsSchema>;

export class SettingsApiError extends Error {
  constructor(
    readonly code: string,
    readonly correlationId: string,
    readonly details: Record<string, unknown>,
  ) {
    super(getBusinessErrorMessage(code));
    this.name = 'SettingsApiError';
  }
}

function invalidResponse(message: string) {
  return new Error(message);
}

function parseSettingsEnvelope<T>(schema: z.ZodType<T>, value: unknown): T {
  return parseRpcEnvelope(schema, value, {
    invalidMessage: invalidResponse('Phản hồi cấu hình không hợp lệ.').message,
    createBusinessError: (error, correlationId) =>
      new SettingsApiError(error.code, correlationId, error.details),
  });
}

export function parseSalesChannels(value: unknown) {
  return parseSettingsEnvelope(
    z.object({ items: z.array(salesChannelSchema) }).strict(),
    value,
  ).items;
}

function transportFailure() {
  return new Error(
    'Không thể kết nối máy chủ. Kết quả thao tác có thể chưa xác định.',
  );
}

export interface SettingsApi {
  listSalesChannels(includeInactive?: boolean): Promise<SalesChannelItem[]>;
  saveSalesChannel(input: {
    channelId?: string;
    values: SalesChannelFormValues;
    idempotencyKey: string;
  }): Promise<{ channelId: string }>;
  getStoreSettings(): Promise<StoreSettings>;
  saveStoreSettings(
    expectedVersion: number,
    settings: Omit<StoreSettings, 'version'>,
    idempotencyKey: string,
  ): Promise<{ version: number }>;
}

export function createSettingsApi(): SettingsApi {
  const client = getSupabaseClient();
  const rpc = async (
    name: Parameters<typeof client.rpc>[0],
    args: Record<string, unknown>,
  ) => {
    const { data, error } = await client.rpc(name, args as never);
    if (error) throw transportFailure();
    return data;
  };

  return {
    async listSalesChannels(includeInactive = false) {
      return parseSalesChannels(
        await rpc('list_sales_channels', {
          p_include_inactive: includeInactive,
        }),
      );
    },
    async saveSalesChannel(input) {
      return parseSettingsEnvelope(
        z.object({ channelId: z.uuid() }).strict(),
        await rpc('save_sales_channel', {
          p_channel_id: input.channelId ?? null,
          p_code: input.values.code,
          p_name: input.values.name,
          p_sort_order: Number(input.values.sortOrder),
          p_is_active: input.values.isActive,
          p_idempotency_key: input.idempotencyKey,
        }),
      );
    },
    async getStoreSettings() {
      return parseSettingsEnvelope(
        storeSettingsSchema,
        await rpc('get_store_settings', {}),
      );
    },
    async saveStoreSettings(expectedVersion, settings, idempotencyKey) {
      return parseSettingsEnvelope(
        z.object({ version: z.number().int() }).strict(),
        await rpc('save_store_settings', {
          p_expected_version: expectedVersion,
          p_settings: settings,
          p_idempotency_key: idempotencyKey,
        }),
      );
    },
  };
}

export const settingsKeys = {
  all: ['settings'] as const,
  channels: (includeInactive: boolean) =>
    ['settings', 'sales-channels', { includeInactive }] as const,
  store: ['settings', 'store'] as const,
};
