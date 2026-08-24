import { ImportApiError, type TransportImportRow } from '../api/import-api';
import type {
  ClientImportError,
  ValidatedClientRow,
} from './client-validation';
import type { ImportTarget } from './contracts';
import type { ValidationDisplayRow } from './validation-display';
import { WorkbookInspectionError } from '../parser/workbook-parser';

export function allowedImportTargets(
  permissions: readonly string[],
): ImportTarget[] {
  const targets: ImportTarget[] = [];
  if (permissions.includes('catalog.basic.manage')) {
    targets.push('CATEGORIES', 'PRODUCTS');
  }
  if (permissions.includes('supplier.manage')) targets.push('SUPPLIERS');
  if (permissions.includes('customer.manage')) targets.push('CUSTOMERS');
  if (permissions.includes('inventory.adjustment.post')) {
    targets.push('OPENING_BALANCES');
  }
  return targets;
}

export function safeImportErrorMessage(error: unknown): string {
  if (
    error instanceof WorkbookInspectionError ||
    error instanceof ImportApiError
  ) {
    return error.message;
  }
  return 'Không thể hoàn tất thao tác. Vui lòng kiểm tra kết nối và thử lại.';
}

export function toTransportRows(
  rows: ValidatedClientRow[],
): TransportImportRow[] {
  return rows.map((row) => {
    const values: TransportImportRow['values'] = {};
    for (const [field, value] of Object.entries(row.values)) {
      if (
        value === null ||
        typeof value === 'string' ||
        typeof value === 'boolean'
      ) {
        values[field] = value;
      } else if (value !== undefined) {
        values[field] = String(value);
      }
    }
    return { rowNumber: row.rowNumber, values };
  });
}

export function toValidationDisplayRows(
  sourceRows: Array<{ rowNumber: number; values: Record<string, unknown> }>,
  validationRows: ValidatedClientRow[],
  errors: ClientImportError[],
): ValidationDisplayRow[] {
  const errorsByRow = new Map<number, ClientImportError[]>();
  for (const error of errors) {
    errorsByRow.set(error.rowNumber, [
      ...(errorsByRow.get(error.rowNumber) ?? []),
      error,
    ]);
  }
  const statusByRow = new Map(
    validationRows.map((row) => [row.rowNumber, row.status]),
  );
  return sourceRows.map((row) => ({
    rowNumber: row.rowNumber,
    values: row.values,
    status: statusByRow.get(row.rowNumber) ?? 'INVALID',
    errors: errorsByRow.get(row.rowNumber) ?? [],
  }));
}
