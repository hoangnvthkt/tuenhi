import { validateCanonicalNumber } from '@/shared/lib/numeric/canonical-number';
import { normalizePhone } from '@/shared/lib/phone/normalize-phone';
import type { ImportTarget } from './contracts';
import { normalizeImportHeader } from './header-normalization';
import { getTemplateContract } from './template-contracts';

export type ClientImportError = {
  rowNumber: number;
  sourceColumn: string | null;
  targetField: string | null;
  code: string;
  message: string;
  rawValue: unknown;
};

export type ValidatedClientRow = {
  rowNumber: number;
  values: Record<string, unknown>;
  status: 'VALID' | 'INVALID';
};

function textValue(raw: unknown) {
  return String(raw ?? '')
    .trim()
    .normalize('NFC');
}

function duplicateKey(target: ImportTarget, values: Record<string, unknown>) {
  const field =
    target === 'CATEGORIES'
      ? 'name'
      : target === 'PRODUCTS' || target === 'OPENING_BALANCES'
        ? 'sku'
        : 'code';
  const value = textValue(values[field]);
  return value ? normalizeImportHeader(value) : null;
}

export function validateClientRows(
  inputRows: Array<{ rowNumber: number; values: Record<string, unknown> }>,
  target: ImportTarget,
  version: number,
): { rows: ValidatedClientRow[]; errors: ClientImportError[] } {
  const contract = getTemplateContract(target, version);
  const errors: ClientImportError[] = [];
  const rows = inputRows.map((input) => {
    const values: Record<string, unknown> = {};
    const addError = (
      targetField: string | null,
      code: string,
      message: string,
      rawValue: unknown,
    ) => {
      errors.push({
        rowNumber: input.rowNumber,
        sourceColumn: null,
        targetField,
        code,
        message,
        rawValue,
      });
    };

    for (const column of contract.columns) {
      const present = Object.hasOwn(input.values, column.field);
      const raw = input.values[column.field];
      const blank = raw === null || raw === undefined || textValue(raw) === '';
      if (blank && column.required) {
        addError(
          column.field,
          'VALUE_REQUIRED',
          'Giá trị bắt buộc không được để trống.',
          raw,
        );
      }
      if (!present) continue;

      if (column.field === 'customerType') {
        const normalized = normalizeImportHeader(textValue(raw));
        if (blank || normalized === 'cá nhân' || normalized === 'individual') {
          values[column.field] = 'INDIVIDUAL';
        } else if (normalized === 'doanh nghiệp' || normalized === 'business') {
          values[column.field] = 'BUSINESS';
        } else {
          values[column.field] = textValue(raw);
          addError(
            column.field,
            'VALIDATION_FAILED',
            'Loại khách hàng chỉ nhận Cá nhân hoặc Doanh nghiệp.',
            raw,
          );
        }
        continue;
      }

      if (column.type === 'boolean') {
        if (blank) continue;
        const normalized = normalizeImportHeader(textValue(raw));
        if (raw === true || normalized === 'có' || normalized === 'true') {
          values[column.field] = true;
        } else if (
          raw === false ||
          normalized === 'không' ||
          normalized === 'false'
        ) {
          values[column.field] = false;
        } else {
          addError(
            column.field,
            'VALIDATION_FAILED',
            'Trạng thái chỉ nhận Có hoặc Không.',
            raw,
          );
        }
        continue;
      }

      if (column.type === 'phone') {
        if (blank) {
          values[column.field] = '';
          continue;
        }
        const phone = normalizePhone(textValue(raw), 'VN');
        if (phone.ok) values[column.field] = phone.e164 ?? '';
        else addError(column.field, phone.code, phone.message, raw);
        continue;
      }

      if (column.type === 'email') {
        const email = textValue(raw).toLowerCase();
        values[column.field] = email;
        if (
          email &&
          (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
        ) {
          addError(
            column.field,
            'EMAIL_FORMAT_INVALID',
            'Email chưa đúng định dạng.',
            raw,
          );
        }
        continue;
      }

      if (column.type === 'quantity' || column.type === 'money') {
        const numeric = textValue(raw);
        if (!numeric) {
          values[column.field] = '';
          continue;
        }
        const result = validateCanonicalNumber(numeric, {
          kind: column.type,
          precision: 18,
          nonNegative: true,
        });
        if (result.ok) {
          values[column.field] = result.value;
          if (
            target === 'OPENING_BALANCES' &&
            column.field === 'openingQuantity' &&
            Number(result.value) <= 0
          ) {
            addError(
              column.field,
              'NUMBER_MUST_BE_POSITIVE',
              'Số lượng tồn đầu kỳ phải lớn hơn 0.',
              raw,
            );
          }
        } else addError(column.field, result.code, result.message, raw);
        continue;
      }

      const value = textValue(raw);
      values[column.field] = value;
      if (column.maxLength && value.length > column.maxLength) {
        addError(
          column.field,
          'VALUE_TOO_LONG',
          `Giá trị không được vượt quá ${column.maxLength} ký tự.`,
          raw,
        );
      }
    }

    if (target === 'CUSTOMERS') {
      const type = values.customerType ?? 'INDIVIDUAL';
      if (type === 'BUSINESS' && !textValue(values.companyName)) {
        addError(
          'companyName',
          'VALUE_REQUIRED',
          'Tên công ty không được để trống với khách doanh nghiệp.',
          values.companyName,
        );
      }
      if (type === 'INDIVIDUAL' && Object.hasOwn(values, 'companyName')) {
        values.companyName = '';
      }
    }

    return {
      rowNumber: input.rowNumber,
      values,
      status: 'VALID' as const,
    };
  });

  const byKey = new Map<string, number[]>();
  for (const row of rows) {
    const key = duplicateKey(target, row.values);
    if (!key) continue;
    byKey.set(key, [...(byKey.get(key) ?? []), row.rowNumber]);
  }
  for (const rowNumbers of byKey.values()) {
    if (rowNumbers.length < 2) continue;
    for (const rowNumber of rowNumbers) {
      errors.push({
        rowNumber,
        sourceColumn: null,
        targetField:
          target === 'CATEGORIES'
            ? 'name'
            : target === 'PRODUCTS' || target === 'OPENING_BALANCES'
              ? 'sku'
              : 'code',
        code: 'DUPLICATE_IN_FILE',
        message: 'Khóa dữ liệu bị trùng trong tệp.',
        rawValue: null,
      });
    }
  }
  const invalidRows = new Set(errors.map((error) => error.rowNumber));
  return {
    rows: rows.map((row) => ({
      ...row,
      status: invalidRows.has(row.rowNumber) ? 'INVALID' : 'VALID',
    })),
    errors,
  };
}
