import { z } from 'zod';
import {
  inventoryCursorSchema,
  inventoryDateTimeSchema,
  inventoryStatusSchema,
} from '../../api/inventory-rpc';

const nullableDateTime = inventoryDateTimeSchema.nullable();
const openingLineSchema = z.object({
  id: z.uuid(),
  productId: z.uuid(),
  productName: z.string(),
  sku: z.string(),
  unitName: z.string(),
  systemQtySnapshot: z.string(),
  inventoryVersionSnapshot: z.number().int().nonnegative(),
  countedQty: z.string(),
  openingUnitCost: z.string(),
  openingValue: z.string(),
  sourceSuggestionId: z.uuid().nullable(),
  unverifiedSourceConfirmed: z.boolean(),
  lineOrder: z.number().int().nonnegative(),
});

export const openingDocumentSchema = z.object({
  id: z.uuid(),
  countNumber: z.string().nullable(),
  countType: z.literal('OPENING'),
  status: inventoryStatusSchema,
  note: z.string().nullable(),
  version: z.number().int().positive(),
  createdByName: z.string(),
  submittedByName: z.string().nullable(),
  postedByName: z.string().nullable(),
  cancelledByName: z.string().nullable(),
  submittedAt: nullableDateTime,
  postedAt: nullableDateTime,
  cancelledAt: nullableDateTime,
  cancelReason: z.string().nullable(),
  createdAt: inventoryDateTimeSchema,
  updatedAt: inventoryDateTimeSchema,
  totalValue: z.string(),
  lines: z.array(openingLineSchema),
});

export const openingPageSchema = z.object({
  items: z.array(
    z.object({
      id: z.uuid(),
      countNumber: z.string().nullable(),
      status: inventoryStatusSchema,
      createdByName: z.string(),
      lineCount: z.number().int().nonnegative(),
      totalQuantity: z.string(),
      totalValue: z.string(),
      version: z.number().int().positive(),
      updatedAt: inventoryDateTimeSchema,
    }),
  ),
  nextCursor: inventoryCursorSchema.nullable(),
});

export const openingSuggestionPageSchema = z.object({
  items: z.array(
    z.object({
      id: z.uuid(),
      sourceImportRunId: z.uuid(),
      sourceRowNumber: z.number().int(),
      productCode: z.string().nullable(),
      productId: z.uuid(),
      productName: z.string(),
      sku: z.string(),
      suggestedUnitCost: z.string().nullable(),
      suggestedOpeningQuantity: z.string().nullable(),
      warningCodes: z.array(z.string()),
      requiresConfirmation: z.literal(true),
    }),
  ),
  nextCursorId: z.uuid().nullable(),
});

export type OpeningDocument = z.infer<typeof openingDocumentSchema>;
export type OpeningSuggestion = z.infer<
  typeof openingSuggestionPageSchema
>['items'][number];
