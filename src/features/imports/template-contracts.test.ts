import { describe, expect, it } from 'vitest';
import {
  CURRENT_TEMPLATE_VERSION,
  IMPORT_TARGETS,
  getTemplateContract,
} from './template-contracts';

describe('catalog import template contracts', () => {
  it('declares the four stable targets and current versions', () => {
    expect(IMPORT_TARGETS).toEqual([
      'CATEGORIES',
      'PRODUCTS',
      'SUPPLIERS',
      'CUSTOMERS',
    ]);
    expect(CURRENT_TEMPLATE_VERSION).toEqual({
      CATEGORIES: 1,
      PRODUCTS: 1,
      SUPPLIERS: 1,
      CUSTOMERS: 2,
    });
  });

  it('keeps the approved product header order and field types', () => {
    const contract = getTemplateContract('PRODUCTS', 1);

    expect(contract.columns.map(({ header }) => header)).toEqual([
      'SKU',
      'Tên sản phẩm',
      'Đơn vị tính',
      'Mã vạch',
      'Nhóm hàng',
      'Mô tả',
      'Ngưỡng tồn tối thiểu',
      'Giá bán hiện hành',
      'Hoạt động',
    ]);
    expect(
      contract.columns.map(({ field, type, required }) => ({
        field,
        type,
        required,
      })),
    ).toEqual([
      { field: 'sku', type: 'text', required: true },
      { field: 'name', type: 'text', required: true },
      { field: 'unitName', type: 'text', required: true },
      { field: 'barcode', type: 'text', required: false },
      { field: 'categoryName', type: 'text', required: false },
      { field: 'description', type: 'text', required: false },
      { field: 'minStockQty', type: 'quantity', required: false },
      { field: 'salePrice', type: 'money', required: false },
      { field: 'isActive', type: 'boolean', required: false },
    ]);
  });

  it('continues accepting customer v1 while v2 carries expanded fields', () => {
    expect(
      getTemplateContract('CUSTOMERS', 1).columns.map(({ field }) => field),
    ).toEqual([
      'name',
      'code',
      'phone',
      'email',
      'address',
      'notes',
      'isActive',
    ]);
    expect(
      getTemplateContract('CUSTOMERS', 2).columns.map(({ field }) => field),
    ).toEqual([
      'name',
      'code',
      'customerType',
      'phone',
      'email',
      'address',
      'companyName',
      'taxCode',
      'customerGroup',
      'notes',
      'isActive',
    ]);
  });

  it('rejects unsupported versions', () => {
    expect(() => getTemplateContract('PRODUCTS', 2)).toThrow(
      'Phiên bản mẫu Excel không được hỗ trợ.',
    );
  });

  it('uses display-safe identifier examples in the instruction sheet', () => {
    const productBarcode = getTemplateContract('PRODUCTS', 1).columns.find(
      ({ field }) => field === 'barcode',
    );
    const customerPhone = getTemplateContract('CUSTOMERS', 2).columns.find(
      ({ field }) => field === 'phone',
    );

    expect(productBarcode?.example).toBe('Mã 0123456789012');
    expect(customerPhone?.example).toBe('SĐT 0912345678');
  });
});
