import { z } from 'zod';
import { getBusinessErrorMessage } from '../../lib/errors/command-error';
import { getSupabaseClient } from '../../lib/supabase/client';
import type { Json } from '../../lib/supabase/database.types';
import type { LegacyResolutions } from '../imports/legacy/legacy-mapping';

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

const qualitySchema = z.enum(['VALID', 'WARNING']);
const legacyListItemSchema = z
  .object({
    id: z.uuid(),
    sourceSaleNumber: z.string().min(1).max(100),
    soldOn: z.iso.date().nullable(),
    customerLabel: z.string().max(200),
    channelLabel: z.string().max(200),
    reportedNetTotal: z.string().nullable(),
    qualityStatus: qualitySchema,
    warningCount: z.number().int().nonnegative(),
    isOperational: z.literal(false),
    sourceImportRunId: z.uuid(),
  })
  .strict();
const cursorSchema = z.object({ soldOn: z.iso.date(), id: z.uuid() }).strict();
const listSchema = z
  .object({
    items: z.array(legacyListItemSchema),
    nextCursor: cursorSchema.nullable(),
  })
  .strict();
const listEnvelopeSchema = envelopeSchema(listSchema);

const lineSchema = z
  .object({
    id: z.uuid(),
    sourceRowNumber: z.number().int().min(2),
    lineNumber: z.number().int().positive(),
    productLabel: z.string().min(1).max(200),
    productCode: z.string().max(100),
    productId: z.uuid().nullable(),
    quantity: z.string().nullable(),
    unitPrice: z.string().nullable(),
    unitPriceProvenance: z
      .enum(['SOURCE_VALUE', 'CACHED_UNVERIFIED'])
      .nullable(),
    lineDiscount: z.string().nullable(),
    lineTotal: z.string().nullable(),
    lineTotalProvenance: z
      .enum(['SOURCE_VALUE', 'CACHED_UNVERIFIED'])
      .nullable(),
    warningCodes: z.array(z.string().min(1).max(100)),
  })
  .strict();
const detailSchema = z
  .object({
    id: z.uuid(),
    sourceSaleNumber: z.string().min(1).max(100),
    sourceRowStart: z.number().int().min(2),
    soldOn: z.iso.date().nullable(),
    staffLabel: z.string().max(200),
    channelLabel: z.string().max(200),
    customerLabel: z.string().max(200),
    customerPhone: z.string().max(32),
    paymentLabel: z.string().max(100),
    paymentMethod: z.enum(['CASH', 'BANK_TRANSFER']).nullable(),
    sourceStatusLabel: z.string().max(100),
    sourceNote: z.string().max(1000),
    profileId: z.uuid().nullable(),
    customerId: z.uuid().nullable(),
    salesChannelId: z.uuid().nullable(),
    reportedSubtotal: z.string().nullable(),
    reportedDiscountTotal: z.string().nullable(),
    reportedNetTotal: z.string().nullable(),
    qualityStatus: qualitySchema,
    warningCodes: z.array(z.string().min(1).max(100)),
    adapterId: z.literal('LEGACY_Q237_V1'),
    sourceFileSha256: z.string().regex(/^[0-9a-f]{64}$/),
    sourceImportRunId: z.uuid(),
    mappingVersion: z.literal(1),
    lines: z.array(lineSchema),
    isOperational: z.literal(false),
  })
  .strict();
const detailEnvelopeSchema = envelopeSchema(detailSchema);

const createSchema = z
  .object({
    importRunId: z.uuid(),
    status: z.literal('UPLOADED'),
    expiresAt: z.iso.datetime({ offset: true }),
  })
  .strict();
const createEnvelopeSchema = envelopeSchema(createSchema);
const mappingSchema = z
  .object({ importRunId: z.uuid(), status: z.literal('MAPPED') })
  .strict();
const mappingEnvelopeSchema = envelopeSchema(mappingSchema);
const progressSchema = z
  .object({
    importRunId: z.uuid(),
    status: z.enum(['MAPPED', 'VALIDATED']),
    totalRows: z.number().int().min(0).max(5000),
    validRows: z.number().int().min(0).max(5000),
    invalidRows: z.number().int().min(0).max(5000),
    nextChunkIndex: z.number().int().nonnegative(),
  })
  .strict();
const progressEnvelopeSchema = envelopeSchema(progressSchema);
const validationSchema = z
  .object({
    importRunId: z.uuid(),
    status: z.literal('VALIDATED'),
    totalRows: z.number().int().min(1).max(5000),
    validRows: z.number().int().min(1).max(5000),
    invalidRows: z.literal(0),
    warningCount: z.number().int().nonnegative(),
    isOperational: z.literal(false),
  })
  .strict();
const validationEnvelopeSchema = envelopeSchema(validationSchema);
const commitSchema = z
  .object({
    importRunId: z.uuid(),
    adapterId: z.literal('LEGACY_Q237_V1'),
    archiveSales: z.number().int().nonnegative(),
    archiveLines: z.number().int().nonnegative(),
    openingSuggestions: z.number().int().nonnegative(),
    isOperational: z.literal(false),
  })
  .strict();
const commitEnvelopeSchema = envelopeSchema(commitSchema);

const legacyMessages: Record<string, string> = {
  LEGACY_MAPPING_REQUIRED:
    'Vui lòng ghép dữ liệu hoặc xác nhận chỉ giữ nhãn cũ trước khi tiếp tục.',
  LEGACY_ARCHIVE_ALREADY_COMMITTED: 'Dữ liệu từ tệp này đã được lưu trước đó.',
  IMPORT_VALIDATION_FAILED:
    'Dữ liệu cũ còn lỗi chặn. Không có hóa đơn nào được lưu.',
  IMPORT_COMMIT_FAILED:
    'Không thể lưu dữ liệu cũ. Không có hóa đơn nào được lưu.',
};

export class LegacySalesApiError extends Error {
  constructor(
    readonly code: string,
    readonly correlationId: string,
  ) {
    super(legacyMessages[code] ?? getBusinessErrorMessage(code));
    this.name = 'LegacySalesApiError';
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
    throw new LegacySalesApiError(envelope.error.code, envelope.correlationId);
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
  message: string,
) {
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw new Error(message);
  return unwrap(parsed.data);
}

export function parseLegacyListEnvelope(value: unknown) {
  return parseEnvelope(
    listEnvelopeSchema,
    value,
    'Phản hồi danh sách dữ liệu cũ không hợp lệ.',
  );
}

export function parseLegacyDetailEnvelope(value: unknown) {
  return parseEnvelope(
    detailEnvelopeSchema,
    value,
    'Phản hồi chi tiết dữ liệu cũ không hợp lệ.',
  );
}

export type LegacySalesPage = z.infer<typeof listSchema>;
export type LegacySaleDetail = z.infer<typeof detailSchema>;
export type LegacyArchiveCommit = z.infer<typeof commitSchema>;
export type LegacyStagedRow = { rowNumber: number; values: Json };

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
  }): Promise<z.infer<typeof createSchema>>;
  saveMapping(
    importRunId: string,
    mapping: LegacyResolutions,
  ): Promise<z.infer<typeof mappingSchema>>;
  uploadChunk(input: {
    importRunId: string;
    chunkIndex: number;
    rows: LegacyStagedRow[];
    isLastChunk: boolean;
  }): Promise<z.infer<typeof progressSchema>>;
  validateImport(
    importRunId: string,
  ): Promise<z.infer<typeof validationSchema>>;
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
      return parseEnvelope(
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
      return parseEnvelope(
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
      return parseEnvelope(
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
      return parseEnvelope(
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
      return parseEnvelope(
        commitEnvelopeSchema,
        data,
        'Phản hồi lưu dữ liệu cũ không hợp lệ.',
      );
    },
  };
}
