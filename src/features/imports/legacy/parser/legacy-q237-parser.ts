import type * as XLSX from 'xlsx';
import { validateCanonicalNumber } from '@/shared/lib/numeric/canonical-number';
import { normalizePhone } from '@/shared/lib/phone/normalize-phone';
import { validateClientRows } from '../../model/client-validation';
import { normalizeImportHeader } from '../../model/header-normalization';
import {
  LEGACY_CUSTOMERS_SHEET,
  LEGACY_CUSTOMER_HEADERS,
  LEGACY_ERROR_MESSAGES,
  LEGACY_OPTIONAL_SHEETS,
  LEGACY_PRODUCTS_SHEET,
  LEGACY_PRODUCT_HEADERS,
  LEGACY_SALES_HEADERS,
  LEGACY_SALES_SHEET,
  type LegacyIssue,
} from '../model/legacy-q237-contract';

const MAX_FILE_SIZE = 5 * 1024 * 1024;
const MAX_SALES_ROWS = 5000;
const SALES_FORMULA_COLUMNS = new Set([5, 6, 9, 11, 15, 16, 17]);

type ExtendedWorkbook = XLSX.WorkBook & {
  vbaraw?: unknown;
  files?: Record<string, unknown>;
};

export type LegacyCachedProvenance =
  'SOURCE_VALUE' | 'CACHED_UNVERIFIED' | null;

export type LegacySaleLine = {
  sourceRowNumber: number;
  lineNumber: number;
  productCode: string;
  productName: string;
  quantity: string | null;
  unitPrice: string | null;
  unitPriceProvenance: LegacyCachedProvenance;
  lineDiscount: string | null;
  lineTotal: string | null;
  lineTotalProvenance: LegacyCachedProvenance;
  warningCodes: string[];
};

export type LegacySaleGroup = {
  sourceSaleNumber: string;
  sourceRowStart: number;
  soldOn: string | null;
  staffLabel: string;
  channelLabel: string;
  customerLabel: string;
  customerPhone: string;
  paymentLabel: string;
  proposedPaymentMethod: 'CASH' | 'BANK_TRANSFER' | null;
  statusLabel: string;
  note: string;
  lines: LegacySaleLine[];
  warningCodes: string[];
};

export type LegacyParseResult = {
  fileName: string;
  fileSha256: string;
  sales: LegacySaleGroup[];
  productCandidates: Array<Record<string, unknown>>;
  customerCandidates: Array<Record<string, unknown>>;
  openingSuggestions: Array<{
    sourceRowNumber: number;
    productCode: string;
    unitCost: string | null;
    openingQuantity: string | null;
    postingAllowed: false;
  }>;
  labels: {
    staff: string[];
    channel: string[];
    customer: string[];
    product: string[];
  };
  issues: LegacyIssue[];
};

export class LegacyWorkbookError extends Error {
  constructor(readonly code: string) {
    super(
      LEGACY_ERROR_MESSAGES[code] ??
        'Không thể kiểm tra tệp dữ liệu bán hàng cũ.',
    );
    this.name = 'LegacyWorkbookError';
  }
}

function text(value: unknown) {
  return String(value ?? '')
    .trim()
    .normalize('NFC');
}

function cellAt(sheet: XLSX.WorkSheet, row: number, column: number) {
  const dense = (sheet as XLSX.WorkSheet & { '!data'?: XLSX.CellObject[][] })[
    '!data'
  ];
  return dense?.[row]?.[column] ?? sheet[`${columnName(column)}${row + 1}`];
}

function columnName(index: number) {
  let value = index + 1;
  let result = '';
  while (value > 0) {
    value -= 1;
    result = String.fromCharCode(65 + (value % 26)) + result;
    value = Math.floor(value / 26);
  }
  return result;
}

function cells(sheet: XLSX.WorkSheet, runtime: typeof import('xlsx')) {
  if (!sheet['!ref']) return [];
  const range = runtime.utils.decode_range(sheet['!ref']);
  const result: Array<{
    row: number;
    column: number;
    cell: XLSX.CellObject;
  }> = [];
  for (let row = range.s.r; row <= range.e.r; row += 1) {
    for (let column = range.s.c; column <= range.e.c; column += 1) {
      const cell = cellAt(sheet, row, column);
      if (cell) result.push({ row, column, cell });
    }
  }
  return result;
}

function exactHeaders(actual: unknown[], expected: readonly string[]) {
  return (
    actual.length === expected.length &&
    expected.every((header, index) => text(actual[index]) === header)
  );
}

function issue(
  issues: LegacyIssue[],
  code: string,
  rowNumber: number | null,
  blocking: boolean,
) {
  issues.push({
    rowNumber,
    code,
    message:
      LEGACY_ERROR_MESSAGES[code] ??
      'Dữ liệu cũ chưa hợp lệ. Vui lòng kiểm tra lại.',
    blocking,
  });
}

function decimal(
  value: unknown,
  kind: 'money' | 'quantity',
  issues: LegacyIssue[],
  rowNumber: number,
) {
  const raw = text(value);
  if (!raw) return null;
  const parsed = validateCanonicalNumber(raw, {
    kind,
    precision: 20,
    nonNegative: true,
  });
  if (!parsed.ok) {
    issues.push({
      rowNumber,
      code: parsed.code,
      message: parsed.message,
      blocking: true,
    });
    return null;
  }
  return parsed.value ?? null;
}

function isoDate(
  value: unknown,
  runtime: typeof import('xlsx'),
  issues: LegacyIssue[],
  rowNumber: number,
) {
  let year: number;
  let month: number;
  let day: number;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    year = value.getUTCFullYear();
    month = value.getUTCMonth() + 1;
    day = value.getUTCDate();
  } else if (typeof value === 'number') {
    const parsed = runtime.SSF.parse_date_code(value);
    if (!parsed) {
      issue(issues, 'VALIDATION_FAILED', rowNumber, true);
      return null;
    }
    ({ y: year, m: month, d: day } = parsed);
  } else {
    const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(text(value));
    if (!match) {
      issue(issues, 'VALIDATION_FAILED', rowNumber, true);
      return null;
    }
    day = Number(match[1]);
    month = Number(match[2]);
    year = Number(match[3]);
  }
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() + 1 !== month ||
    date.getUTCDate() !== day
  ) {
    issue(issues, 'VALIDATION_FAILED', rowNumber, true);
    return null;
  }
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function cachedValue(
  sheet: XLSX.WorkSheet,
  matrix: unknown[][],
  rowIndex: number,
  columnIndex: number,
  issues: LegacyIssue[],
) {
  const cell = cellAt(sheet, rowIndex, columnIndex);
  const isFormula = cell?.f !== undefined;
  const value = matrix[rowIndex]?.[columnIndex];
  if (
    isFormula &&
    (cell.v === undefined || cell.v === null || text(value) === '')
  ) {
    issue(issues, 'LEGACY_CACHED_VALUE_MISSING', rowIndex + 1, false);
    return { value: null, provenance: null } as const;
  }
  if (isFormula) {
    issue(issues, 'LEGACY_CACHED_VALUE_UNVERIFIED', rowIndex + 1, false);
  }
  return {
    value: value ?? null,
    provenance: isFormula
      ? ('CACHED_UNVERIFIED' as const)
      : ('SOURCE_VALUE' as const),
  };
}

function unique(values: string[]) {
  return [...new Set(values.filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, 'vi'),
  );
}

export function proposeLegacyChannelCode(label: string) {
  const normalized = normalizeImportHeader(label);
  const mapping: Record<string, string> = {
    'bán tại quầy': 'IN_STORE',
    'bán hàng tại cửa hàng': 'IN_STORE',
    'tại cửa hàng': 'IN_STORE',
    'khách tỉnh': 'REMOTE_PROVINCE',
    online: 'ONLINE',
    'đại lý': 'WHOLESALE',
  };
  return mapping[normalized] ?? null;
}

export function proposeLegacyPaymentMethod(label: string) {
  const normalized = normalizeImportHeader(label);
  if (normalized === 'tiền mặt') return 'CASH' as const;
  if (normalized === 'chuyển khoản') return 'BANK_TRANSFER' as const;
  return null;
}

async function sha256(bytes: ArrayBuffer) {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('');
}

export async function parseLegacyQ237Workbook(
  file: File,
): Promise<LegacyParseResult> {
  if (
    !file.name.toLocaleLowerCase('en-US').endsWith('.xlsx') ||
    file.size > MAX_FILE_SIZE
  ) {
    throw new LegacyWorkbookError('LEGACY_WORKBOOK_UNSUPPORTED');
  }
  const bytes = await file.arrayBuffer();
  const signature = new Uint8Array(bytes, 0, Math.min(4, bytes.byteLength));
  if (
    signature.length < 4 ||
    signature[0] !== 0x50 ||
    signature[1] !== 0x4b ||
    signature[2] !== 0x03 ||
    signature[3] !== 0x04
  ) {
    throw new LegacyWorkbookError('LEGACY_WORKBOOK_UNSUPPORTED');
  }

  const runtime = await import('xlsx');
  let workbook: ExtendedWorkbook;
  try {
    workbook = runtime.read(bytes, {
      type: 'array',
      dense: true,
      cellFormula: true,
      cellDates: true,
      bookVBA: true,
      bookFiles: true,
    }) as ExtendedWorkbook;
  } catch {
    throw new LegacyWorkbookError('LEGACY_WORKBOOK_UNSUPPORTED');
  }
  const filePaths = Object.keys(workbook.files ?? {});
  if (
    workbook.vbaraw ||
    filePaths.some((path) =>
      /(?:externalLinks|vbaProject\.bin|EncryptionInfo|EncryptedPackage)/i.test(
        path,
      ),
    )
  ) {
    throw new LegacyWorkbookError('LEGACY_WORKBOOK_UNSUPPORTED');
  }

  const required = [
    LEGACY_SALES_SHEET,
    LEGACY_PRODUCTS_SHEET,
    LEGACY_CUSTOMERS_SHEET,
  ];
  if (required.some((name) => !workbook.SheetNames.includes(name))) {
    throw new LegacyWorkbookError('LEGACY_SHEET_FINGERPRINT_MISMATCH');
  }
  const unknownSheets = workbook.SheetNames.filter(
    (name) =>
      !required.includes(name) &&
      !(LEGACY_OPTIONAL_SHEETS as readonly string[]).includes(name),
  );
  if (
    unknownSheets.length > 1 ||
    unknownSheets.some(
      (name) => cells(workbook.Sheets[name]!, runtime).length > 0,
    )
  ) {
    throw new LegacyWorkbookError('LEGACY_SHEET_FINGERPRINT_MISMATCH');
  }

  const salesSheet = workbook.Sheets[LEGACY_SALES_SHEET]!;
  const productSheet = workbook.Sheets[LEGACY_PRODUCTS_SHEET]!;
  const customerSheet = workbook.Sheets[LEGACY_CUSTOMERS_SHEET]!;
  const salesMatrix = runtime.utils.sheet_to_json<unknown[]>(salesSheet, {
    header: 1,
    raw: true,
    blankrows: true,
    defval: null,
  });
  const productMatrix = runtime.utils.sheet_to_json<unknown[]>(productSheet, {
    header: 1,
    raw: true,
    blankrows: true,
    defval: null,
  });
  const customerMatrix = runtime.utils.sheet_to_json<unknown[]>(customerSheet, {
    header: 1,
    raw: true,
    blankrows: true,
    defval: null,
  });
  if (
    !exactHeaders(salesMatrix[0] ?? [], LEGACY_SALES_HEADERS) ||
    !exactHeaders(productMatrix[0] ?? [], LEGACY_PRODUCT_HEADERS) ||
    !exactHeaders(customerMatrix[0] ?? [], LEGACY_CUSTOMER_HEADERS)
  ) {
    throw new LegacyWorkbookError('LEGACY_SHEET_FINGERPRINT_MISMATCH');
  }

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName]!;
    for (const entry of cells(sheet, runtime)) {
      if (entry.cell.t === 'e') {
        throw new LegacyWorkbookError('LEGACY_WORKBOOK_UNSUPPORTED');
      }
      if (entry.cell.f === undefined) continue;
      const allowedSummary = (
        LEGACY_OPTIONAL_SHEETS as readonly string[]
      ).includes(sheetName);
      const allowedSales =
        sheetName === LEGACY_SALES_SHEET &&
        entry.row >= 1 &&
        SALES_FORMULA_COLUMNS.has(entry.column);
      if (!allowedSummary && !allowedSales) {
        throw new LegacyWorkbookError('LEGACY_FORMULA_NOT_ALLOWED');
      }
    }
  }

  const issues: LegacyIssue[] = [];
  const sales: LegacySaleGroup[] = [];
  const seenInvoices = new Set<string>();
  const groupFields = [
    ['soldOn', 0],
    ['staffLabel', 2],
    ['channelLabel', 3],
    ['customerLabel', 4],
    ['customerPhone', 5],
    ['paymentLabel', 12],
    ['statusLabel', 13],
    ['note', 14],
  ] as const;

  for (let rowIndex = 1; rowIndex < salesMatrix.length; rowIndex += 1) {
    const row = salesMatrix[rowIndex] ?? [];
    const productCodeCache = cachedValue(
      salesSheet,
      salesMatrix,
      rowIndex,
      6,
      issues,
    );
    const productCode = text(productCodeCache.value);
    const productName = text(row[7]);
    if (!productCode && !productName) continue;
    if (sales.length >= MAX_SALES_ROWS) {
      throw new LegacyWorkbookError('LEGACY_WORKBOOK_UNSUPPORTED');
    }
    let current = sales.at(-1) ?? null;
    const explicitInvoice = text(row[1]);
    if (explicitInvoice && current?.sourceSaleNumber !== explicitInvoice) {
      if (seenInvoices.has(explicitInvoice)) {
        issue(issues, 'LEGACY_DUPLICATE_INVOICE_NUMBER', rowIndex + 1, true);
      }
      seenInvoices.add(explicitInvoice);
      const phoneCache = cachedValue(
        salesSheet,
        salesMatrix,
        rowIndex,
        5,
        issues,
      );
      const phone = normalizePhone(text(phoneCache.value), 'VN');
      current = {
        sourceSaleNumber: explicitInvoice,
        sourceRowStart: rowIndex + 1,
        soldOn: isoDate(row[0], runtime, issues, rowIndex + 1),
        staffLabel: text(row[2]),
        channelLabel: text(row[3]),
        customerLabel: text(row[4]),
        customerPhone: phone.ok ? (phone.e164 ?? '') : text(phoneCache.value),
        paymentLabel: text(row[12]),
        proposedPaymentMethod: proposeLegacyPaymentMethod(text(row[12])),
        statusLabel: text(row[13]),
        note: text(row[14]),
        lines: [],
        warningCodes: [],
      };
      sales.push(current);
    } else if (!explicitInvoice && !current) {
      issue(issues, 'LEGACY_INVOICE_NUMBER_REQUIRED', rowIndex + 1, true);
      continue;
    }
    if (!current) continue;

    if (current.lines.length > 0) {
      for (const [field, column] of groupFields) {
        const repeated = text(row[column]);
        if (!repeated) continue;
        const original =
          field === 'soldOn'
            ? current.soldOn
            : (current[field] as string | null);
        const compared =
          field === 'soldOn'
            ? isoDate(row[column], runtime, [], rowIndex + 1)
            : repeated;
        if (compared !== original) {
          issue(issues, 'LEGACY_GROUP_CONFLICT', rowIndex + 1, true);
          break;
        }
      }
    }

    const unitPriceCache = cachedValue(
      salesSheet,
      salesMatrix,
      rowIndex,
      9,
      issues,
    );
    const totalCache = cachedValue(
      salesSheet,
      salesMatrix,
      rowIndex,
      11,
      issues,
    );
    const rowWarnings = issues
      .filter((entry) => entry.rowNumber === rowIndex + 1 && !entry.blocking)
      .map((entry) => entry.code);
    current.lines.push({
      sourceRowNumber: rowIndex + 1,
      lineNumber: current.lines.length + 1,
      productCode,
      productName,
      quantity: decimal(row[8], 'quantity', issues, rowIndex + 1),
      unitPrice: decimal(unitPriceCache.value, 'money', issues, rowIndex + 1),
      unitPriceProvenance: unitPriceCache.provenance,
      lineDiscount: decimal(row[10], 'money', issues, rowIndex + 1),
      lineTotal: decimal(totalCache.value, 'money', issues, rowIndex + 1),
      lineTotalProvenance: totalCache.provenance,
      warningCodes: unique(rowWarnings),
    });
    current.warningCodes = unique([
      ...current.warningCodes,
      ...rowWarnings,
      ...(current.proposedPaymentMethod || !current.paymentLabel
        ? []
        : ['LEGACY_PAYMENT_LABEL_ONLY']),
    ]);
  }

  const productCandidates: Array<Record<string, unknown>> = [];
  const openingSuggestions: LegacyParseResult['openingSuggestions'] = [];
  for (let rowIndex = 1; rowIndex < productMatrix.length; rowIndex += 1) {
    const row = productMatrix[rowIndex] ?? [];
    if (!row.some((value) => text(value))) continue;
    const values = {
      sku: text(row[0]),
      name: text(row[1]),
      categoryName: text(row[2]),
      unitName: text(row[3]),
      barcode: '',
      description: text(row[7]),
      minStockQty: '',
      salePrice: text(row[4]),
      isActive: true,
    };
    const validation = validateClientRows(
      [{ rowNumber: rowIndex + 1, values }],
      'PRODUCTS',
      1,
    );
    productCandidates.push(validation.rows[0]?.values ?? values);
    for (const error of validation.errors) {
      issues.push({ ...error, blocking: true });
    }
    openingSuggestions.push({
      sourceRowNumber: rowIndex + 1,
      productCode: values.sku,
      unitCost: decimal(row[5], 'money', issues, rowIndex + 1),
      openingQuantity: decimal(row[6], 'quantity', issues, rowIndex + 1),
      postingAllowed: false,
    });
  }

  const customerCandidates: Array<Record<string, unknown>> = [];
  for (let rowIndex = 1; rowIndex < customerMatrix.length; rowIndex += 1) {
    const row = customerMatrix[rowIndex] ?? [];
    if (!row.some((value) => text(value))) continue;
    const values = {
      customerType: text(row[0]),
      code: text(row[2]),
      name: text(row[3]),
      phone: text(row[4]),
      email: text(row[13]),
      address: text(row[5]),
      companyName: text(row[8]),
      taxCode: text(row[9]),
      customerGroup: text(row[15]),
      notes: text(row[16]),
      isActive: ['1', 'true'].includes(text(row[26]).toLowerCase()),
    };
    const validation = validateClientRows(
      [{ rowNumber: rowIndex + 1, values }],
      'CUSTOMERS',
      2,
    );
    customerCandidates.push(validation.rows[0]?.values ?? values);
    for (const error of validation.errors) {
      issues.push({ ...error, blocking: true });
    }
  }

  return {
    fileName: file.name,
    fileSha256: await sha256(bytes),
    sales,
    productCandidates,
    customerCandidates,
    openingSuggestions,
    labels: {
      staff: unique(sales.map((sale) => sale.staffLabel)),
      channel: unique(sales.map((sale) => sale.channelLabel)),
      customer: unique(sales.map((sale) => sale.customerLabel)),
      product: unique(
        sales.flatMap((sale) =>
          sale.lines.map((line) => line.productCode || line.productName),
        ),
      ),
    },
    issues,
  };
}
