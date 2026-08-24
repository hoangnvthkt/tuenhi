import { z } from 'zod';
import { getBusinessErrorMessage } from '@/shared/api/command-error';

export const importStatusSchema = z.enum([
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
  'OPENING_BALANCES',
]);
const importHistoryTargetSchema = z.union([
  importTargetSchema,
  z.literal('LEGACY_SALES_ARCHIVE'),
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
export const createEnvelopeSchema = envelopeSchema(createResultSchema);

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
export const progressEnvelopeSchema = envelopeSchema(progressSchema);

const mappingResultSchema = z
  .object({ importRunId: z.uuid(), status: z.literal('MAPPED') })
  .strict();
export const mappingEnvelopeSchema = envelopeSchema(mappingResultSchema);

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
export const validationEnvelopeSchema = envelopeSchema(validationResultSchema);

const commitResultSchema = z
  .object({
    importRunId: z.uuid(),
    targetType: importTargetSchema,
    createdRows: z.number().int().min(0).max(5000),
    updatedRows: z.number().int().min(0).max(5000),
    totalRows: z.number().int().min(0).max(5000),
    stockCountId: z.uuid().optional(),
  })
  .strict();
export const commitEnvelopeSchema = envelopeSchema(commitResultSchema);

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
export const runResultEnvelopeSchema = envelopeSchema(runResultSchema);

const historyItemSchema = runResultSchema
  .pick({
    importRunId: true,
    fileName: true,
    mode: true,
    status: true,
    totalRows: true,
    validRows: true,
    invalidRows: true,
    createdAt: true,
    committedAt: true,
  })
  .extend({ targetType: importHistoryTargetSchema });
const historyPageSchema = z
  .object({
    items: z.array(historyItemSchema),
    nextCursor: z
      .object({ createdAt: dateTimeSchema, id: z.uuid() })
      .strict()
      .nullable(),
  })
  .strict();
export const historyEnvelopeSchema = envelopeSchema(historyPageSchema);

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

export function parseImportEnvelope<T>(
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
  if (!parsed.data.ok) {
    const invalidRows = z
      .number()
      .int()
      .nonnegative()
      .safeParse(parsed.data.error.details.invalidRows);
    throw new ImportApiError(
      parsed.data.error.code,
      parsed.data.correlationId,
      {
        ...(invalidRows.success ? { invalidRows: invalidRows.data } : {}),
      },
    );
  }
  return parsed.data.data;
}

export function parseImportCreateEnvelope(value: unknown) {
  return parseImportEnvelope(
    createEnvelopeSchema,
    value,
    'Phản hồi tạo phiên nhập dữ liệu không hợp lệ.',
  );
}

export function parseImportValidationEnvelope(value: unknown) {
  return parseImportEnvelope(
    validationEnvelopeSchema,
    value,
    'Phản hồi kiểm tra nhập dữ liệu không hợp lệ.',
  );
}

export type ImportCreateResult = z.infer<typeof createResultSchema>;
export type ImportMappingResult = z.infer<typeof mappingResultSchema>;
export type ImportProgress = z.infer<typeof progressSchema>;
export type ImportValidationResult = z.infer<typeof validationResultSchema>;
export type ImportCommitResult = z.infer<typeof commitResultSchema>;
export type ImportRunResult = z.infer<typeof runResultSchema>;
export type ImportHistoryPage = z.infer<typeof historyPageSchema>;
export type ImportStatus = z.infer<typeof importStatusSchema>;
