import { describe, expect, it } from 'vitest';
import { legacyQ237Fixture } from '../model/legacy-q237-fixture';
import {
  LegacyWorkbookError,
  parseLegacyQ237Workbook,
  proposeLegacyChannelCode,
  proposeLegacyPaymentMethod,
} from './legacy-q237-parser';

describe('legacy Q237 fixed adapter', () => {
  it('groups adjacent and carry-forward lines without trusting helper columns', async () => {
    const result = await parseLegacyQ237Workbook(legacyQ237Fixture());

    expect(result.sales).toHaveLength(1);
    expect(result.sales[0]).toMatchObject({
      sourceSaleNumber: 'HD-GIA-001',
      sourceRowStart: 2,
      soldOn: '2026-08-21',
      staffLabel: 'Nhân viên Mẫu',
      channelLabel: 'Online',
      paymentLabel: 'Chuyển khoản',
    });
    expect(result.sales[0]?.lines).toHaveLength(2);
    expect(result.sales[0]?.lines.map((line) => line.lineNumber)).toEqual([
      1, 2,
    ]);
    expect(JSON.stringify(result.sales)).not.toMatch(
      /Mã đơn liên kết HĐ|STT SP trong đơn|Khóa HĐ-SP/,
    );
    expect(result.sales[0]?.lines[0]).toMatchObject({
      unitPrice: '25000',
      unitPriceProvenance: 'CACHED_UNVERIFIED',
      lineTotal: '49000',
      lineTotalProvenance: 'CACHED_UNVERIFIED',
    });
  });

  it('removes excluded customer cells before producing candidates', async () => {
    const result = await parseLegacyQ237Workbook(legacyQ237Fixture());
    expect(result.customerCandidates[0]).toEqual({
      customerType: 'INDIVIDUAL',
      code: 'KH-GIA-001',
      name: 'Khách Mẫu',
      phone: '+84912345678',
      email: 'khach-mau@example.invalid',
      address: 'Địa chỉ tổng hợp',
      companyName: '',
      taxCode: '',
      customerGroup: 'Khách thường',
      notes: 'Ghi chú tổng hợp',
      isActive: true,
    });
    expect(JSON.stringify(result.customerCandidates)).not.toMatch(
      /ID-GIA-KHONG-LUU|social-khong-luu|Chi nhánh giả|Khu vực giả|Phường giả|999999|99/,
    );
  });

  it('stages cost and opening quantity only as deferred suggestions', async () => {
    const result = await parseLegacyQ237Workbook(legacyQ237Fixture());
    expect(result.openingSuggestions[0]).toEqual({
      sourceRowNumber: 2,
      productCode: 'SP-GIA-001',
      unitCost: '14000',
      openingQuantity: '20',
      postingAllowed: false,
    });
  });

  it('rejects formulas outside the fixed allowlist', async () => {
    const parsing = parseLegacyQ237Workbook(
      legacyQ237Fixture({ formulaOutsideAllowlist: true }),
    );
    await expect(parsing).rejects.toBeInstanceOf(LegacyWorkbookError);
    await expect(parsing).rejects.toMatchObject({
      code: 'LEGACY_FORMULA_NOT_ALLOWED',
    });
  });

  it('warns when an allowlisted formula has no cached value', async () => {
    const result = await parseLegacyQ237Workbook(
      legacyQ237Fixture({ missingCachedTotal: true }),
    );
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          rowNumber: 2,
          code: 'LEGACY_CACHED_VALUE_MISSING',
          blocking: false,
        }),
      ]),
    );
    expect(result.sales[0]?.lines[0]?.lineTotal).toBeNull();
  });

  it.each([
    [{ disjointDuplicate: true }, 'LEGACY_DUPLICATE_INVOICE_NUMBER'] as const,
    [{ groupConflict: true }, 'LEGACY_GROUP_CONFLICT'] as const,
    [{ invalidDate: true }, 'VALIDATION_FAILED'] as const,
  ])('reports blocking grouping/date defects', async (options, code) => {
    const result = await parseLegacyQ237Workbook(legacyQ237Fixture(options));
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code, blocking: true }),
      ]),
    );
  });

  it('uses controlled channel and payment proposals only', () => {
    expect(proposeLegacyChannelCode('Bán tại quầy')).toBe('IN_STORE');
    expect(proposeLegacyChannelCode('Tại cửa hàng')).toBe('IN_STORE');
    expect(proposeLegacyChannelCode('Khách tỉnh')).toBe('REMOTE_PROVINCE');
    expect(proposeLegacyChannelCode('Online')).toBe('ONLINE');
    expect(proposeLegacyChannelCode('Đại lý')).toBe('WHOLESALE');
    expect(proposeLegacyChannelCode('Kênh không rõ')).toBeNull();
    expect(proposeLegacyPaymentMethod('Tiền mặt')).toBe('CASH');
    expect(proposeLegacyPaymentMethod('Chuyển khoản')).toBe('BANK_TRANSFER');
    expect(proposeLegacyPaymentMethod('Ghi nợ')).toBeNull();
  });
});
