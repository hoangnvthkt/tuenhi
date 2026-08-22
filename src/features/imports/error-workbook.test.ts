import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import type {
  ClientImportError,
  ValidatedClientRow,
} from './client-validation';
import { buildErrorWorkbook } from './error-workbook';

describe('buildErrorWorkbook', () => {
  it('exports allowed values, Vietnamese errors and a code summary without formulas', async () => {
    const rows: ValidatedClientRow[] = [
      {
        rowNumber: 2,
        values: { name: 'Khách A', phone: '0912 345 678' },
        status: 'INVALID',
      },
    ];
    const errors: ClientImportError[] = [
      {
        rowNumber: 2,
        sourceColumn: null,
        targetField: 'phone',
        code: 'PHONE_FORMAT_INVALID',
        message: 'Số điện thoại chưa đúng định dạng quốc tế.',
        rawValue: '0912 345 678',
      },
    ];
    const blob = await buildErrorWorkbook({
      target: 'CUSTOMERS',
      version: 2,
      rows,
      errors,
    });
    const workbook = XLSX.read(await blob.arrayBuffer(), {
      type: 'array',
      cellFormula: true,
    });
    expect(workbook.SheetNames).toEqual(['Dữ liệu lỗi', 'Tổng hợp lỗi']);
    const data = XLSX.utils.sheet_to_json<unknown[]>(
      workbook.Sheets['Dữ liệu lỗi']!,
      {
        header: 1,
        raw: false,
      },
    );
    expect(data[0]).toEqual(
      expect.arrayContaining([
        'Tên khách hàng',
        'Số điện thoại',
        'Trạng thái',
        'Lỗi',
        'Mã lỗi',
      ]),
    );
    expect(data[1]).toEqual(
      expect.arrayContaining([
        'Khách A',
        '0912 345 678',
        'Có lỗi',
        'Số điện thoại chưa đúng định dạng quốc tế.',
        'PHONE_FORMAT_INVALID',
      ]),
    );
    expect(JSON.stringify(data)).not.toMatch(/CCCD|Ngày sinh|Facebook|Công nợ/);
    const summary = XLSX.utils.sheet_to_json<unknown[]>(
      workbook.Sheets['Tổng hợp lỗi']!,
      { header: 1, raw: false },
    );
    expect(summary).toEqual([
      ['Mã lỗi', 'Số lượng'],
      ['PHONE_FORMAT_INVALID', '1'],
    ]);
    for (const sheet of Object.values(workbook.Sheets)) {
      expect(
        Object.values(sheet).some(
          (cell) => typeof cell === 'object' && cell && 'f' in cell,
        ),
      ).toBe(false);
    }
  });
});
