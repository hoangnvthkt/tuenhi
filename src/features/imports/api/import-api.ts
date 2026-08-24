import { z } from 'zod';
import { getSupabaseClient } from '@/shared/supabase/client';
import type { Json } from '@/shared/supabase/database.types';
import type { ImportMode, ImportTarget } from '../model/contracts';
import {
  commitEnvelopeSchema,
  historyEnvelopeSchema,
  ImportApiError,
  mappingEnvelopeSchema,
  parseImportCreateEnvelope,
  parseImportEnvelope,
  parseImportValidationEnvelope,
  progressEnvelopeSchema,
  runResultEnvelopeSchema,
  type ImportCommitResult,
  type ImportCreateResult,
  type ImportHistoryPage,
  type ImportMappingResult,
  type ImportProgress,
  type ImportRunResult,
  type ImportStatus,
  type ImportValidationResult,
} from './import-schemas';

export {
  ImportApiError,
  parseImportCreateEnvelope,
  parseImportValidationEnvelope,
};
export type {
  ImportCommitResult,
  ImportHistoryPage,
  ImportProgress,
  ImportRunResult,
  ImportValidationResult,
};

export type TransportImportRow = {
  rowNumber: number;
  values: Record<string, string | boolean | null>;
};

export interface ImportApi {
  createRun(input: {
    target: ImportTarget;
    templateVersion: number;
    fileName: string;
    fileSha256: string;
    mode: ImportMode;
    idempotencyKey: string;
  }): Promise<ImportCreateResult>;
  saveMapping(
    importRunId: string,
    mapping: Record<string, string>,
  ): Promise<ImportMappingResult>;
  validateChunk(input: {
    importRunId: string;
    chunkIndex: number;
    rows: TransportImportRow[];
    isLastChunk: boolean;
  }): Promise<ImportProgress>;
  getValidation(input: {
    importRunId: string;
    cursorRowNumber?: number;
    limit?: number;
  }): Promise<ImportValidationResult>;
  commit(
    importRunId: string,
    idempotencyKey: string,
  ): Promise<ImportCommitResult>;
  getResult(importRunId: string): Promise<ImportRunResult>;
  listHistory(input?: {
    target?: ImportTarget;
    status?: ImportStatus;
    cursor?: { createdAt: string; id: string };
    limit?: number;
  }): Promise<ImportHistoryPage>;
}

function transportFailure() {
  return new Error(
    'Không thể kết nối máy chủ. Kết quả thao tác có thể chưa xác định.',
  );
}

export function createImportApi(): ImportApi {
  const client = getSupabaseClient();
  return {
    async createRun(input) {
      const { data, error } = await client.rpc('create_import_run', {
        p_target_type: input.target,
        p_template_version: input.templateVersion,
        p_file_name: input.fileName,
        p_file_sha256: input.fileSha256,
        p_mode: input.mode,
        p_idempotency_key: input.idempotencyKey,
      });
      if (error) throw transportFailure();
      return parseImportCreateEnvelope(data);
    },
    async saveMapping(importRunId, mapping) {
      const { data, error } = await client.rpc('save_import_mapping', {
        p_import_run_id: importRunId,
        p_mapping: mapping,
      });
      if (error) throw transportFailure();
      return parseImportEnvelope(
        mappingEnvelopeSchema,
        data,
        'Phản hồi ghép cột không hợp lệ.',
      );
    },
    async validateChunk(input) {
      const parsedRows = z
        .array(
          z
            .object({
              rowNumber: z.number().int().min(2).max(5001),
              values: z.record(
                z.string(),
                z.union([z.string(), z.boolean(), z.null()]),
              ),
            })
            .strict(),
        )
        .min(1)
        .max(250)
        .parse(input.rows);
      const { data, error } = await client.rpc('validate_import_rows', {
        p_import_run_id: input.importRunId,
        p_chunk_index: input.chunkIndex,
        p_rows: parsedRows as Json,
        p_is_last_chunk: input.isLastChunk,
      });
      if (error) throw transportFailure();
      return parseImportEnvelope(
        progressEnvelopeSchema,
        data,
        'Phản hồi tiến độ kiểm tra không hợp lệ.',
      );
    },
    async getValidation(input) {
      const { data, error } = await client.rpc('get_import_validation_result', {
        p_import_run_id: input.importRunId,
        p_cursor_row_number: input.cursorRowNumber,
        p_limit: input.limit ?? 50,
      });
      if (error) throw transportFailure();
      return parseImportValidationEnvelope(data);
    },
    async commit(importRunId, idempotencyKey) {
      const { data, error } = await client.rpc('commit_import', {
        p_import_run_id: importRunId,
        p_idempotency_key: idempotencyKey,
      });
      if (error) throw transportFailure();
      return parseImportEnvelope(
        commitEnvelopeSchema,
        data,
        'Phản hồi xác nhận nhập dữ liệu không hợp lệ.',
      );
    },
    async getResult(importRunId) {
      const { data, error } = await client.rpc('get_import_result', {
        p_import_run_id: importRunId,
      });
      if (error) throw transportFailure();
      return parseImportEnvelope(
        runResultEnvelopeSchema,
        data,
        'Phản hồi phiên nhập dữ liệu không hợp lệ.',
      );
    },
    async listHistory(input = {}) {
      const { data, error } = await client.rpc('list_import_runs', {
        p_target_type: input.target,
        p_status: input.status,
        p_cursor_created_at: input.cursor?.createdAt,
        p_cursor_id: input.cursor?.id,
        p_limit: input.limit ?? 30,
      });
      if (error) throw transportFailure();
      return parseImportEnvelope(
        historyEnvelopeSchema,
        data,
        'Phản hồi lịch sử nhập dữ liệu không hợp lệ.',
      );
    },
  };
}
