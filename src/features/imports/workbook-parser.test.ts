import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import { getTemplateContract } from './template-contracts';
import { inspectWorkbook, WorkbookInspectionError } from './workbook-parser';

function workbookFile({
  headers = ['SKU', 'Tên sản phẩm', 'Đơn vị tính'],
  rows = [['SP-001', 'Sản phẩm A', 'Hộp']],
  formula,
  merge,
  extraSheet,
}: {
  headers?: string[];
  rows?: unknown[][];
  formula?: boolean;
  merge?: boolean;
  extraSheet?: boolean;
} = {}) {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet([['Hướng dẫn']]),
    'Hướng dẫn',
  );
  const data = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  if (formula) data.A2 = { t: 'n', f: '1+1', v: 2 };
  if (merge) data['!merges'] = [XLSX.utils.decode_range('A2:B2')];
  XLSX.utils.book_append_sheet(workbook, data, 'Dữ liệu');
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet([
      ['template_type', 'PRODUCTS'],
      ['template_version', 1],
      ['generator_version', 1],
    ]),
    '__tuenhi_meta',
  );
  workbook.Workbook = {
    Sheets: workbook.SheetNames.map((name) => ({
      name,
      Hidden: name === '__tuenhi_meta' ? 2 : 0,
    })),
  };
  if (extraSheet) {
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.aoa_to_sheet([['không hợp lệ']]),
      'Sheet thêm',
    );
  }
  const bytes = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' });
  return new File([bytes], 'products.xlsx', {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}

describe('inspectWorkbook', () => {
  it('reads an exact template entirely in memory with stable row numbers', async () => {
    const contract = getTemplateContract('PRODUCTS', 1);
    const file = workbookFile({
      headers: contract.columns.map((column) => column.header),
      rows: [contract.columns.map((column) => column.example)],
    });
    const result = await inspectWorkbook(file, {
      target: 'PRODUCTS',
      version: 1,
    });
    expect(result.exactTemplate).toBe(true);
    expect(result.fileSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(result.rows).toEqual([expect.objectContaining({ rowNumber: 2 })]);
    expect(result.headers).toEqual(
      contract.columns.map((column) => column.header),
    );
  });

  it.each([
    ['FORMULA_NOT_ALLOWED', workbookFile({ formula: true })],
    ['WORKBOOK_FORMAT_INVALID', workbookFile({ merge: true })],
    ['SHEET_REQUIRED', workbookFile({ extraSheet: true })],
  ])('rejects hostile workbook content with %s', async (code, file) => {
    await expect(
      inspectWorkbook(file, { target: 'PRODUCTS', version: 1 }),
    ).rejects.toMatchObject({ code });
  });

  it('rejects wrong extension/signature and files over 5 MiB before parsing', async () => {
    await expect(
      inspectWorkbook(new File(['not zip'], 'data.csv'), {
        target: 'PRODUCTS',
        version: 1,
      }),
    ).rejects.toBeInstanceOf(WorkbookInspectionError);
    await expect(
      inspectWorkbook(
        new File([new Uint8Array(5 * 1024 * 1024 + 1)], 'data.xlsx'),
        { target: 'PRODUCTS', version: 1 },
      ),
    ).rejects.toMatchObject({ code: 'WORKBOOK_TOO_LARGE' });
  });

  it('enforces 50 columns, 5,000 rows and metadata fingerprints', async () => {
    await expect(
      inspectWorkbook(
        workbookFile({
          headers: Array.from({ length: 51 }, (_, index) => `C${index}`),
        }),
        { target: 'PRODUCTS', version: 1 },
      ),
    ).rejects.toMatchObject({ code: 'ROW_LIMIT_EXCEEDED' });
    await expect(
      inspectWorkbook(
        workbookFile({
          rows: Array.from({ length: 5001 }, () => ['A', 'B', 'C']),
        }),
        { target: 'PRODUCTS', version: 1 },
      ),
    ).rejects.toMatchObject({ code: 'ROW_LIMIT_EXCEEDED' });
    await expect(
      inspectWorkbook(workbookFile(), { target: 'CUSTOMERS', version: 2 }),
    ).rejects.toMatchObject({ code: 'TEMPLATE_VERSION_UNSUPPORTED' });
  });
});
