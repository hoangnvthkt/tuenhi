import type * as XLSX from 'xlsx';
import type { ImportTarget } from '../model/contracts';
import { normalizeImportHeader } from '../model/header-normalization';
import { getTemplateContract } from '../model/template-contracts';

const MAX_FILE_SIZE = 5 * 1024 * 1024;
const MAX_ROWS = 5000;
const MAX_COLUMNS = 50;
const REQUIRED_SHEETS = ['Hướng dẫn', 'Dữ liệu', '__tuenhi_meta'];

const messages: Record<string, string> = {
  WORKBOOK_FORMAT_INVALID:
    'Tệp Excel không đúng định dạng hoặc có nội dung không được hỗ trợ.',
  WORKBOOK_TOO_LARGE: 'Tệp Excel không được lớn hơn 5 MiB.',
  ROW_LIMIT_EXCEEDED: 'Tệp chỉ được có tối đa 5.000 dòng dữ liệu và 50 cột.',
  SHEET_REQUIRED:
    'Tệp phải có đúng các trang Hướng dẫn, Dữ liệu và __tuenhi_meta.',
  FORMULA_NOT_ALLOWED: 'Tệp nhập không được chứa công thức.',
  TEMPLATE_VERSION_UNSUPPORTED:
    'Loại dữ liệu hoặc phiên bản mẫu Excel không được hỗ trợ.',
};

export class WorkbookInspectionError extends Error {
  constructor(readonly code: string) {
    super(messages[code] ?? 'Không thể kiểm tra tệp Excel.');
    this.name = 'WorkbookInspectionError';
  }
}

export type InspectedWorkbook = {
  target: ImportTarget;
  version: number;
  fileName: string;
  fileSha256: string;
  exactTemplate: boolean;
  headers: string[];
  rows: Array<{ rowNumber: number; cells: unknown[] }>;
};

type ExtendedWorkbook = XLSX.WorkBook & {
  vbaraw?: unknown;
  files?: Record<string, unknown>;
};

function allCells(sheet: XLSX.WorkSheet, runtime: typeof import('xlsx')) {
  const dense = (sheet as XLSX.WorkSheet & { '!data'?: unknown[][] })['!data'];
  if (Array.isArray(dense))
    return dense.flat().filter(Boolean) as XLSX.CellObject[];
  if (!sheet['!ref']) return [];
  const range = runtime.utils.decode_range(sheet['!ref']);
  const cells: XLSX.CellObject[] = [];
  for (let row = range.s.r; row <= range.e.r; row += 1) {
    for (let column = range.s.c; column <= range.e.c; column += 1) {
      const cell = sheet[runtime.utils.encode_cell({ r: row, c: column })];
      if (cell) cells.push(cell);
    }
  }
  return cells;
}

function metadata(sheet: XLSX.WorkSheet, runtime: typeof import('xlsx')) {
  const rows = runtime.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    raw: false,
    blankrows: false,
  });
  return Object.fromEntries(
    rows
      .filter((row) => row.length >= 2)
      .map((row) => [String(row[0]), String(row[1])]),
  );
}

function nonBlank(value: unknown) {
  return value !== null && value !== undefined && String(value).trim() !== '';
}

async function sha256(bytes: ArrayBuffer) {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('');
}

export async function inspectWorkbook(
  file: File,
  expected: { target: ImportTarget; version: number },
): Promise<InspectedWorkbook> {
  if (!file.name.toLocaleLowerCase('en-US').endsWith('.xlsx')) {
    throw new WorkbookInspectionError('WORKBOOK_FORMAT_INVALID');
  }
  if (file.size > MAX_FILE_SIZE) {
    throw new WorkbookInspectionError('WORKBOOK_TOO_LARGE');
  }
  const bytes = await file.arrayBuffer();
  const signature = new Uint8Array(bytes, 0, Math.min(bytes.byteLength, 4));
  if (
    signature.length < 4 ||
    signature[0] !== 0x50 ||
    signature[1] !== 0x4b ||
    signature[2] !== 0x03 ||
    signature[3] !== 0x04
  ) {
    throw new WorkbookInspectionError('WORKBOOK_FORMAT_INVALID');
  }

  let workbook: ExtendedWorkbook;
  const runtime = await import('xlsx');
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
    throw new WorkbookInspectionError('WORKBOOK_FORMAT_INVALID');
  }

  if (
    workbook.SheetNames.length !== REQUIRED_SHEETS.length ||
    workbook.SheetNames.some((name, index) => name !== REQUIRED_SHEETS[index])
  ) {
    throw new WorkbookInspectionError('SHEET_REQUIRED');
  }
  const paths = Object.keys(workbook.files ?? {});
  if (
    workbook.vbaraw ||
    paths.some((path) =>
      /(?:externalLinks|vbaProject\.bin|EncryptionInfo|EncryptedPackage)/i.test(
        path,
      ),
    )
  ) {
    throw new WorkbookInspectionError('WORKBOOK_FORMAT_INVALID');
  }
  for (const name of workbook.SheetNames) {
    if (
      allCells(workbook.Sheets[name]!, runtime).some(
        (cell) => cell.f !== undefined,
      )
    ) {
      throw new WorkbookInspectionError('FORMULA_NOT_ALLOWED');
    }
  }

  const dataSheet = workbook.Sheets['Dữ liệu'];
  if (!dataSheet) throw new WorkbookInspectionError('SHEET_REQUIRED');
  if ((dataSheet['!merges'] ?? []).some((range) => range.e.r >= 1)) {
    throw new WorkbookInspectionError('WORKBOOK_FORMAT_INVALID');
  }
  const metadataSheetState = workbook.Workbook?.Sheets?.find(
    (sheet) => sheet.name === '__tuenhi_meta',
  );
  const metaSheet = workbook.Sheets.__tuenhi_meta;
  if (!metaSheet || metadataSheetState?.Hidden !== 2) {
    throw new WorkbookInspectionError('TEMPLATE_VERSION_UNSUPPORTED');
  }
  const meta = metadata(metaSheet, runtime);
  if (
    meta.template_type !== expected.target ||
    meta.template_version !== String(expected.version)
  ) {
    throw new WorkbookInspectionError('TEMPLATE_VERSION_UNSUPPORTED');
  }

  const matrix = runtime.utils.sheet_to_json<unknown[]>(dataSheet, {
    header: 1,
    raw: true,
    blankrows: true,
    defval: null,
  });
  const headers = (matrix[0] ?? []).map((value) =>
    value === null || value === undefined ? '' : String(value),
  );
  if (headers.length > MAX_COLUMNS) {
    throw new WorkbookInspectionError('ROW_LIMIT_EXCEEDED');
  }
  const rows = matrix
    .slice(1)
    .map((cells, index) => ({
      rowNumber: index + 2,
      cells: headers.map((_, column) => cells[column] ?? null),
    }))
    .filter((row) => row.cells.some(nonBlank));
  if (rows.length > MAX_ROWS) {
    throw new WorkbookInspectionError('ROW_LIMIT_EXCEEDED');
  }

  const contract = getTemplateContract(expected.target, expected.version);
  const exactTemplate =
    headers.length === contract.columns.length &&
    headers.every(
      (header, index) =>
        normalizeImportHeader(header) ===
        normalizeImportHeader(contract.columns[index]?.header ?? ''),
    );

  return {
    target: expected.target,
    version: expected.version,
    fileName: file.name,
    fileSha256: await sha256(bytes),
    exactTemplate,
    headers,
    rows,
  };
}
