import { getSupabaseClient } from '@/shared/supabase/client';
import type { Json } from '@/shared/supabase/database.types';
import type { LegacyResolutions } from '@/features/imports';
import {
  commitEnvelopeSchema,
  createEnvelopeSchema,
  LegacySalesApiError,
  mappingEnvelopeSchema,
  parseLegacyDetailEnvelope,
  parseLegacyEnvelope,
  parseLegacyListEnvelope,
  progressEnvelopeSchema,
  validationEnvelopeSchema,
  type LegacyArchiveCommit,
  type LegacyCreateResult,
  type LegacyMappingResult,
  type LegacyProgress,
  type LegacySaleDetail,
  type LegacySalesPage,
  type LegacyStagedRow,
  type LegacyValidation,
} from './legacy-sales-schemas';

export {
  LegacySalesApiError,
  parseLegacyDetailEnvelope,
  parseLegacyListEnvelope,
};
export type {
  LegacyArchiveCommit,
  LegacySaleDetail,
  LegacySalesPage,
  LegacyStagedRow,
};

export interface LegacySalesApi {
  list(input: {
    search?: string;
    from?: string;
    to?: string;
    channelId?: string;
    quality?: 'VALID' | 'WARNING';
    importRunId?: string;
    cursor?: { soldOn: string; id: string };
    limit?: number;
  }): Promise<LegacySalesPage>;
  detail(id: string): Promise<LegacySaleDetail>;
  createImport(input: {
    fileName: string;
    fileSha256: string;
    idempotencyKey: string;
  }): Promise<LegacyCreateResult>;
  saveMapping(
    importRunId: string,
    mapping: LegacyResolutions,
  ): Promise<LegacyMappingResult>;
  uploadChunk(input: {
    importRunId: string;
    chunkIndex: number;
    rows: LegacyStagedRow[];
    isLastChunk: boolean;
  }): Promise<LegacyProgress>;
  validateImport(importRunId: string): Promise<LegacyValidation>;
  commitImport(
    importRunId: string,
    idempotencyKey: string,
  ): Promise<LegacyArchiveCommit>;
}

function transportFailure() {
  return new Error(
    'Không thể kết nối máy chủ. Kết quả thao tác có thể chưa xác định.',
  );
}

export function createLegacySalesApi(): LegacySalesApi {
  const client = getSupabaseClient();
  return {
    async list(input) {
      const { data, error } = await client.rpc('get_legacy_sales', {
        p_filters: {
          search: input.search || undefined,
          from: input.from || undefined,
          to: input.to || undefined,
          channelId: input.channelId || undefined,
          quality: input.quality || undefined,
          importRunId: input.importRunId || undefined,
        },
        p_cursor_sold_on: input.cursor?.soldOn,
        p_cursor_id: input.cursor?.id,
        p_limit: input.limit ?? 30,
      });
      if (error) throw transportFailure();
      return parseLegacyListEnvelope(data);
    },
    async detail(id) {
      const { data, error } = await client.rpc('get_legacy_sale', {
        p_legacy_sale_id: id,
      });
      if (error) throw transportFailure();
      return parseLegacyDetailEnvelope(data);
    },
    async createImport(input) {
      const { data, error } = await client.rpc('create_import_run', {
        p_target_type: 'LEGACY_SALES_ARCHIVE',
        p_template_version: 1,
        p_file_name: input.fileName,
        p_file_sha256: input.fileSha256,
        p_mode: 'CREATE_ONLY',
        p_idempotency_key: input.idempotencyKey,
      });
      if (error) throw transportFailure();
      return parseLegacyEnvelope(
        createEnvelopeSchema,
        data,
        'Phản hồi tạo phiên dữ liệu cũ không hợp lệ.',
      );
    },
    async saveMapping(importRunId, mapping) {
      const { data, error } = await client.rpc('save_legacy_import_mapping', {
        p_import_run_id: importRunId,
        p_mapping: mapping as unknown as Json,
      });
      if (error) throw transportFailure();
      return parseLegacyEnvelope(
        mappingEnvelopeSchema,
        data,
        'Phản hồi mapping dữ liệu cũ không hợp lệ.',
      );
    },
    async uploadChunk(input) {
      const { data, error } = await client.rpc('validate_import_rows', {
        p_import_run_id: input.importRunId,
        p_chunk_index: input.chunkIndex,
        p_rows: input.rows as unknown as Json,
        p_is_last_chunk: input.isLastChunk,
      });
      if (error) throw transportFailure();
      return parseLegacyEnvelope(
        progressEnvelopeSchema,
        data,
        'Phản hồi tải dữ liệu cũ không hợp lệ.',
      );
    },
    async validateImport(importRunId) {
      const { data, error } = await client.rpc('validate_legacy_sales_import', {
        p_import_run_id: importRunId,
      });
      if (error) throw transportFailure();
      return parseLegacyEnvelope(
        validationEnvelopeSchema,
        data,
        'Phản hồi kiểm tra dữ liệu cũ không hợp lệ.',
      );
    },
    async commitImport(importRunId, idempotencyKey) {
      const { data, error } = await client.rpc('commit_legacy_sales_import', {
        p_import_run_id: importRunId,
        p_idempotency_key: idempotencyKey,
      });
      if (error) throw transportFailure();
      return parseLegacyEnvelope(
        commitEnvelopeSchema,
        data,
        'Phản hồi lưu dữ liệu cũ không hợp lệ.',
      );
    },
  };
}
