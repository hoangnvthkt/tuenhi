import { describe, expect, it } from 'vitest';
import { validateClientRows } from './client-validation';

describe('client import validation', () => {
  it('normalizes product text, booleans and canonical numbers', () => {
    const result = validateClientRows(
      [
        {
          rowNumber: 2,
          values: {
            sku: ' SP-001 ',
            name: ' Sản phẩm A ',
            unitName: ' Hộp ',
            minStockQty: '10.500',
            salePrice: 25000,
            isActive: 'Có',
          },
        },
      ],
      'PRODUCTS',
      1,
    );
    expect(result.errors).toEqual([]);
    expect(result.rows[0]).toEqual({
      rowNumber: 2,
      values: {
        sku: 'SP-001',
        name: 'Sản phẩm A',
        unitName: 'Hộp',
        minStockQty: '10.500',
        salePrice: '25000',
        isActive: true,
      },
      status: 'VALID',
    });
  });

  it('returns stable row/cell errors for strict phone, email and numeric input', () => {
    const result = validateClientRows(
      [
        {
          rowNumber: 8,
          values: {
            name: 'Khách A',
            phone: '0912 345 678',
            email: 'sai-email',
          },
        },
        {
          rowNumber: 9,
          values: {
            name: 'Khách B',
            phone: '０９１２３４５６７８',
          },
        },
      ],
      'CUSTOMERS',
      2,
    );
    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          rowNumber: 8,
          targetField: 'phone',
          code: 'PHONE_FORMAT_INVALID',
        }),
        expect.objectContaining({
          rowNumber: 8,
          targetField: 'email',
          code: 'EMAIL_FORMAT_INVALID',
        }),
        expect.objectContaining({
          rowNumber: 9,
          targetField: 'phone',
          code: 'PHONE_FORMAT_INVALID',
        }),
      ]),
    );
    expect(result.rows.every((row) => row.status === 'INVALID')).toBe(true);
  });

  it('detects required, scale, format and duplicate-in-file errors', () => {
    const result = validateClientRows(
      [
        {
          rowNumber: 2,
          values: {
            sku: 'SP-01',
            name: '',
            unitName: 'Hộp',
            salePrice: '12,500',
          },
        },
        {
          rowNumber: 3,
          values: {
            sku: ' sp-01 ',
            name: 'B',
            unitName: 'Hộp',
            minStockQty: '1.2345',
          },
        },
      ],
      'PRODUCTS',
      1,
    );
    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          rowNumber: 2,
          targetField: 'name',
          code: 'VALUE_REQUIRED',
        }),
        expect.objectContaining({
          rowNumber: 2,
          targetField: 'salePrice',
          code: 'NUMBER_FORMAT_INVALID',
        }),
        expect.objectContaining({
          rowNumber: 3,
          targetField: 'minStockQty',
          code: 'NUMBER_SCALE_EXCEEDED',
        }),
        expect.objectContaining({ rowNumber: 2, code: 'DUPLICATE_IN_FILE' }),
        expect.objectContaining({ rowNumber: 3, code: 'DUPLICATE_IN_FILE' }),
      ]),
    );
  });

  it('maps customer types and enforces company for business customers', () => {
    const result = validateClientRows(
      [
        {
          rowNumber: 2,
          values: {
            name: 'Công ty A',
            customerType: 'Doanh nghiệp',
            companyName: '',
          },
        },
        {
          rowNumber: 3,
          values: {
            name: 'Khách A',
            customerType: 'Cá nhân',
            companyName: 'Bị xóa',
          },
        },
      ],
      'CUSTOMERS',
      2,
    );
    expect(result.errors).toEqual([
      expect.objectContaining({
        rowNumber: 2,
        targetField: 'companyName',
        code: 'VALUE_REQUIRED',
      }),
    ]);
    expect(result.rows[1]?.values).toEqual({
      name: 'Khách A',
      customerType: 'INDIVIDUAL',
      companyName: '',
    });
  });
});
