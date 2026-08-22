import { describe, expect, it } from 'vitest';
import { buildSanitizedRows, proposeMapping, validateMapping } from './mapping';

describe('import mapping', () => {
  it('proposes exact and controlled aliases but leaves unknown columns unresolved', () => {
    const mapping = proposeMapping(
      ['Mã SP', 'Tên SP', 'ĐVT', 'Cột lạ'],
      'PRODUCTS',
      1,
    );
    expect(mapping.map((item) => item.targetField)).toEqual([
      'sku',
      'name',
      'unitName',
      null,
    ]);
    expect(validateMapping(mapping, 'PRODUCTS', 1)).toEqual({
      ok: false,
      issues: [
        expect.objectContaining({
          code: 'COLUMN_MAPPING_REQUIRED',
          sourceHeader: 'Cột lạ',
        }),
      ],
    });
  });

  it('blocks duplicate headers, target mappings and unconfirmed ignores', () => {
    const duplicate = proposeMapping(
      ['SKU', ' sku ', 'Tên sản phẩm', 'Đơn vị tính'],
      'PRODUCTS',
      1,
    );
    expect(validateMapping(duplicate, 'PRODUCTS', 1)).toEqual({
      ok: false,
      issues: expect.arrayContaining([
        expect.objectContaining({ code: 'HEADER_DUPLICATE' }),
        expect.objectContaining({ code: 'COLUMN_MAPPING_DUPLICATE' }),
      ]),
    });
    const ignored = proposeMapping(
      ['SKU', 'Tên sản phẩm', 'Đơn vị tính', 'Khác'],
      'PRODUCTS',
      1,
    );
    ignored[3] = {
      ...ignored[3]!,
      targetField: 'IGNORED',
      ignoreConfirmed: false,
    };
    expect(validateMapping(ignored, 'PRODUCTS', 1)).toEqual({
      ok: false,
      issues: [expect.objectContaining({ code: 'COLUMN_MAPPING_REQUIRED' })],
    });
  });

  it('permanently excludes sensitive customer columns before transport', () => {
    const mapping = proposeMapping(
      ['Tên khách hàng', 'SĐT', 'Số CMND/CCCD', 'Ngày sinh', 'Facebook'],
      'CUSTOMERS',
      2,
    );
    expect(mapping.slice(2).map((item) => item.targetField)).toEqual([
      'IGNORED_SENSITIVE',
      'IGNORED_SENSITIVE',
      'IGNORED_SENSITIVE',
    ]);
    const rows = buildSanitizedRows(
      [
        {
          rowNumber: 2,
          cells: [
            'Khách A',
            '0912345678',
            '012345678901',
            '01/01/1990',
            'social-profile',
          ],
        },
      ],
      mapping,
      'CUSTOMERS',
      2,
    );
    expect(rows).toEqual([
      {
        rowNumber: 2,
        values: { name: 'Khách A', phone: '0912345678' },
      },
    ]);
    expect(JSON.stringify(rows)).not.toContain('012345678901');
    expect(JSON.stringify(rows)).not.toContain('01/01/1990');
    expect(JSON.stringify(rows)).not.toContain('social-profile');
  });
});
