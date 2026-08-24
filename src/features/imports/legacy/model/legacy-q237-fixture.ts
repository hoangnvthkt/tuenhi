import * as XLSX from 'xlsx';
import {
  LEGACY_CUSTOMERS_SHEET,
  LEGACY_CUSTOMER_HEADERS,
  LEGACY_OPTIONAL_SHEETS,
  LEGACY_PRODUCTS_SHEET,
  LEGACY_PRODUCT_HEADERS,
  LEGACY_SALES_HEADERS,
  LEGACY_SALES_SHEET,
} from './legacy-q237-contract';

type FixtureOptions = {
  missingCachedTotal?: boolean;
  formulaOutsideAllowlist?: boolean;
  disjointDuplicate?: boolean;
  groupConflict?: boolean;
  invalidDate?: boolean;
};

function formula(
  value: string | number | boolean | Date | undefined,
  expression = '1+1',
): XLSX.CellObject {
  return { t: typeof value === 'number' ? 'n' : 's', v: value, f: expression };
}

export function legacyQ237Fixture(options: FixtureOptions = {}) {
  const workbook = XLSX.utils.book_new();
  const salesRows: unknown[][] = [
    [...LEGACY_SALES_HEADERS],
    [
      options.invalidDate ? '31/02/2026' : '21/08/2026',
      'HD-GIA-001',
      'Nhân viên Mẫu',
      'Online',
      'Khách Mẫu',
      formula('0912345678'),
      formula('SP-GIA-001'),
      'Sản phẩm Mẫu A',
      2,
      formula(25000),
      1000,
      options.missingCachedTotal ? formula('') : formula(49000),
      'Chuyển khoản',
      'Hoàn thành',
      'Ghi chú tổng hợp',
      formula('HD-GIA-001'),
      formula(1),
      formula('HD-GIA-001|1'),
    ],
    [
      '',
      '',
      options.groupConflict ? 'Nhân viên Khác' : '',
      '',
      '',
      '',
      'SP-GIA-002',
      'Sản phẩm Mẫu B',
      1,
      15000,
      0,
      15000,
      '',
      '',
      '',
      '',
      '',
      '',
    ],
  ];
  if (options.disjointDuplicate) {
    salesRows.push(
      [
        '22/08/2026',
        'HD-GIA-002',
        'Nhân viên Mẫu',
        'Tại cửa hàng',
        '',
        '',
        'SP-GIA-003',
        'Sản phẩm Mẫu C',
        1,
        10000,
        0,
        10000,
        'Tiền mặt',
        'Hoàn thành',
        '',
        '',
        '',
        '',
      ],
      [
        '23/08/2026',
        'HD-GIA-001',
        'Nhân viên Mẫu',
        'Online',
        '',
        '',
        'SP-GIA-004',
        'Sản phẩm Mẫu D',
        1,
        12000,
        0,
        12000,
        'Tiền mặt',
        'Hoàn thành',
        '',
        '',
        '',
        '',
      ],
    );
  }
  const salesSheet = XLSX.utils.aoa_to_sheet(salesRows, { cellDates: true });
  if (options.formulaOutsideAllowlist) {
    salesSheet.H2 = formula('Sản phẩm Mẫu A');
  }
  XLSX.utils.book_append_sheet(workbook, salesSheet, LEGACY_SALES_SHEET);

  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet([
      [...LEGACY_PRODUCT_HEADERS],
      [
        'SP-GIA-001',
        'Sản phẩm Mẫu A',
        'Nhóm Mẫu',
        'Hộp',
        25000,
        14000,
        20,
        'Dữ liệu tổng hợp',
      ],
      [
        'SP-GIA-002',
        'Sản phẩm Mẫu B',
        'Nhóm Mẫu',
        'Chai',
        15000,
        8000,
        10,
        'Dữ liệu tổng hợp',
      ],
    ]),
    LEGACY_PRODUCTS_SHEET,
  );

  const customerRow = Array.from(
    { length: LEGACY_CUSTOMER_HEADERS.length },
    () => '',
  );
  Object.assign(customerRow, {
    0: 'Cá nhân',
    1: 'Chi nhánh giả',
    2: 'KH-GIA-001',
    3: 'Khách Mẫu',
    4: '0912345678',
    5: 'Địa chỉ tổng hợp',
    6: 'Khu vực giả',
    7: 'Phường giả',
    10: 'ID-GIA-KHONG-LUU',
    13: 'khach-mau@example.invalid',
    14: 'social-khong-luu',
    15: 'Khách thường',
    16: 'Ghi chú tổng hợp',
    17: 99,
    23: 999999,
    26: 1,
  });
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet([[...LEGACY_CUSTOMER_HEADERS], customerRow]),
    LEGACY_CUSTOMERS_SHEET,
  );

  for (const sheetName of LEGACY_OPTIONAL_SHEETS) {
    const sheet = XLSX.utils.aoa_to_sheet([['Báo cáo tổng hợp'], [formula(2)]]);
    XLSX.utils.book_append_sheet(workbook, sheet, sheetName);
  }
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet([]),
    'Trang trống',
  );

  const bytes = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' });
  return new File([bytes], 'du-lieu-cu-tong-hop.xlsx', {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}
