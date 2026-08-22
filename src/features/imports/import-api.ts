import { z } from 'zod';
import { getBusinessErrorMessage } from '../../lib/errors/command-error';
import { getSupabaseClient } from '../../lib/supabase/client';
import type { Json } from '../../lib/supabase/database.types';
import type { ImportMode, ImportTarget } from './contracts';

const importStatusSchema = z.enum([
  'UPLOADED',
  'MAPPED',
  'VALIDATED',
  'COMMITTED',
  'FAILED',
  'EXPIRED',
]);
const importTargetSchema = z.enum([
  'CATEGORIES',
  'PRODUCTS',
  'SUPPLIERS',
  'CUSTOMERS',
]);
const importModeSchema = z.enum(['CREATE_ONLY', 'UPDATE_EXISTING']);
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

const createResultSchema = z
  .object({
    importRunId: z.uuid(),
    status: importStatusSchema,
    expiresAt: dateTimeSchema,
  })
  .strict();
const createEnvelopeSchema = envelopeSchema(createResultSchema);

const progressSchema = z
  .object({
    importRunId: z.uuid(),
    status: importStatusSchema,
    totalRows: z.number().int().min(0).max(5000),
    validRows: z.number().int().min(0).max(5000),
    invalidRows: z.number().int().min(0).max(5000),
    nextChunkIndex: z.number().int().nonnegative(),
  })
  .strict();
const progressEnvelopeSchema = envelopeSchema(progressSchema);

const mappingResultSchema = z
  .object({ importRunId: z.uuid(), status: z.literal('MAPPED') })
  .strict();
const mappingEnvelopeSchema = envelopeSchema(mappingResultSchema);

const validationErrorSchema = z
  .object({
    sourceColumn: z.string().nullable(),
    targetField: z.string().nullable(),
    code: z.string().min(1).max(100),
    message: z.string().min(1).max(1000),
    rawValue: z.unknown(),
  })
  .strict();
const validationSummarySchema = z
  .object({
    importRunId: z.uuid(),
    targetType: importTargetSchema,
    status: importStatusSchema,
    totalRows: z.number().int().min(0).max(5000),
    validRows: z.number().int().min(0).max(5000),
    invalidRows: z.number().int().min(0).max(5000),
  })
  .strict();
const validationResultSchema = z
  .object({
    summary: validationSummarySchema,
    items: z.array(
      z
        .object({
          rowNumber: z.number().int().min(2).max(5001),
          status: z.enum(['VALID', 'INVALID']),
          values: z.record(z.string(), z.unknown()),
          errors: z.array(validationErrorSchema),
        })
        .strict(),
    ),
    nextCursorRowNumber: z.number().int().min(2).max(5001).nullable(),
  })
  .strict();
const validationEnvelopeSchema = envelopeSchema(validationResultSchema);

const commitResultSchema = z
  .object({
    importRunId: z.uuid(),
    targetType: importTargetSchema,
    createdRows: z.number().int().min(0).max(5000),
    updatedRows: z.number().int().min(0).max(5000),
    totalRows: z.number().int().min(0).max(5000),
  })
  .strict();
const commitEnvelopeSchema = envelopeSchema(commitResultSchema);

const runResultSchema = z
  .object({
    importRunId: z.uuid(),
    targetType: importTargetSchema,
    templateVersion: z.number().int().positive(),
    fileName: z.string().min(1).max(255),
    fileSha256: z.string().regex(/^[0-9a-f]{64}$/),
    mode: importModeSchema,
    status: importStatusSchema,
    totalRows: z.number().int().min(0).max(5000),
    validRows: z.number().int().min(0).max(5000),
    invalidRows: z.number().int().min(0).max(5000),
    result: commitResultSchema.nullable(),
    createdAt: dateTimeSchema,
    validatedAt: dateTimeSchema.nullable(),
    committedAt: dateTimeSchema.nullable(),
    expiresAt: dateTimeSchema,
  })
  .strict();
const runResultEnvelopeSchema = envelopeSchema(runResultSchema);

const historyItemSchema = runResultSchema.pick({
  importRunId: true,
  targetType: true,
  fileName: true,
  mode: true,
  status: true,
  totalRows: true,
  validRows: true,
  invalidRows: true,
  createdAt: true,
  committedAt: true,
});
const historyPageSchema = z
  .object({
    items: z.array(historyItemSchema),
    nextCursor: z
      .object({ createdAt: dateTimeSchema, id: z.uuid() })
      .strict()
      .nullable(),
  })
  .strict();
const historyEnvelopeSchema = envelopeSchema(historyPageSchema);

const importErrorMessages: Record<string, string> = {
  COLUMN_MAPPING_REQUIRED: 'Vui lòng ghép đủ các cột bắt buộc.',
  COLUMN_MAPPING_DUPLICATE: 'Mỗi trường chỉ được ghép với một cột.',
  TEMPLATE_VERSION_UNSUPPORTED: 'Phiên bản mẫu Excel chưa được hỗ trợ.',
  ROW_LIMIT_EXCEEDED: 'Tệp vượt quá giới hạn 5.000 dòng dữ liệu.',
  IMPORT_VALIDATION_FAILED:
    'Tệp còn dữ liệu chưa hợp lệ. Vui lòng kiểm tra danh sách lỗi.',
  IMPORT_COMMIT_FAILED: 'Không thể nhập dữ liệu. Không có dòng nào được lưu.',
  IMPORT_ALREADY_COMMITTED: 'Phiên nhập đã được xác nhận trước đó.',
};

export class ImportApiError extends Error {
  constructor(
    readonly code: string,
    readonly correlationId: string,
    readonly details: { invalidRows?: number },
  ) {
    super(importErrorMessages[code] ?? getBusinessErrorMessage(code));
    this.name = 'ImportApiError';
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
    const invalidRows = z
      .number()
      .int()
      .nonnegative()
      .safeParse(envelope.error.details.invalidRows);
    throw new ImportApiError(envelope.error.code, envelope.correlationId, {
      ...(invalidRows.success ? { invalidRows: invalidRows.data } : {}),
    });
  }
  return envelope.data;
}

function parseEnvelope<T>(
  schema: z.ZodType<
    | { ok: true; data: T; correlationId: string }
    | {
        ok: false;
        data: null;
        error: z.infer<typeof commandErrorSchema>;
        correlationId: string;
      }
  >,
  value: unknown,
  invalidMessage: string,
): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw new Error(invalidMessage);
  return unwrap(parsed.data);
}

export function parseImportCreateEnvelope(value: unknown) {
  return parseEnvelope(
    createEnvelopeSchema,
    value,
    'Phản hồi tạo phiên nhập dữ liệu không hợp lệ.',
  );
}

export function parseImportValidationEnvelope(value: unknown) {
  return parseEnvelope(
    validationEnvelopeSchema,
    value,
    'Phản hồi kiểm tra nhập dữ liệu không hợp lệ.',
  );
}

export type ImportProgress = z.infer<typeof progressSchema>;
export type ImportValidationResult = z.infer<typeof validationResultSchema>;
export type ImportCommitResult = z.infer<typeof commitResultSchema>;
export type ImportRunResult = z.infer<typeof runResultSchema>;
export type ImportHistoryPage = z.infer<typeof historyPageSchema>;

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
  }): Promise<z.infer<typeof createResultSchema>>;
  saveMapping(
    importRunId: string,
    mapping: Record<string, string>,
  ): Promise<z.infer<typeof mappingResultSchema>>;
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
    status?: z.infer<typeof importStatusSchema>;
    cursor?: { createdAt: string; id: string };
    limit?: number;
  }): Promise<ImportHistoryPage>;
}

function transportFailure() {
  return new Error(
    'Không thể kết nối máy chủ. Kết quả thao tác có thể chưa xác định.',
  );
}

function parseWith<T>(
  schema: z.ZodType<
    | { ok: true; data: T; correlationId: string }
    | {
        ok: false;
        data: null;
        error: z.infer<typeof commandErrorSchema>;
        correlationId: string;
      }
  >,
  value: unknown,
  message: string,
) {
  return parseEnvelope(schema, value, message);
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
      return parseWith(
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
      return parseWith(
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
      return parseWith(
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
      return parseWith(
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
      return parseWith(
        historyEnvelopeSchema,
        data,
        'Phản hồi lịch sử nhập dữ liệu không hợp lệ.',
      );
    },
  };
}
