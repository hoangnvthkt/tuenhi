import { z } from 'zod';
import { getBusinessErrorMessage } from '@/shared/api/command-error';
import type { Json } from '@/shared/supabase/database.types';

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
export const listEnvelopeSchema = envelopeSchema(listSchema);

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
export const detailEnvelopeSchema = envelopeSchema(detailSchema);

const createSchema = z
  .object({
    importRunId: z.uuid(),
    status: z.literal('UPLOADED'),
    expiresAt: z.iso.datetime({ offset: true }),
  })
  .strict();
export const createEnvelopeSchema = envelopeSchema(createSchema);
const mappingSchema = z
  .object({ importRunId: z.uuid(), status: z.literal('MAPPED') })
  .strict();
export const mappingEnvelopeSchema = envelopeSchema(mappingSchema);
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
export const progressEnvelopeSchema = envelopeSchema(progressSchema);
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
export const validationEnvelopeSchema = envelopeSchema(validationSchema);
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
export const commitEnvelopeSchema = envelopeSchema(commitSchema);

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

export function parseLegacyEnvelope<T>(
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
): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw new Error(message);
  if (!parsed.data.ok) {
    throw new LegacySalesApiError(
      parsed.data.error.code,
      parsed.data.correlationId,
    );
  }
  return parsed.data.data;
}

export function parseLegacyListEnvelope(value: unknown) {
  return parseLegacyEnvelope(
    listEnvelopeSchema,
    value,
    'Phản hồi danh sách dữ liệu cũ không hợp lệ.',
  );
}

export function parseLegacyDetailEnvelope(value: unknown) {
  return parseLegacyEnvelope(
    detailEnvelopeSchema,
    value,
    'Phản hồi chi tiết dữ liệu cũ không hợp lệ.',
  );
}

export type LegacySalesPage = z.infer<typeof listSchema>;
export type LegacySaleDetail = z.infer<typeof detailSchema>;
export type LegacyArchiveCommit = z.infer<typeof commitSchema>;
export type LegacyCreateResult = z.infer<typeof createSchema>;
export type LegacyMappingResult = z.infer<typeof mappingSchema>;
export type LegacyProgress = z.infer<typeof progressSchema>;
export type LegacyValidation = z.infer<typeof validationSchema>;
export type LegacyStagedRow = { rowNumber: number; values: Json };
