import { describe, expect, it } from 'vitest';
import { validateProductForm } from './catalog-validation';

const validProduct = {
  sku: 'SP-001',
  barcode: '0123456789012',
  name: 'Sản phẩm mẫu',
  categoryId: '',
  unitName: 'Hộp',
  description: '',
  minStockQty: '10',
  salePrice: '25000.50',
  isActive: true,
};

describe('validateProductForm', () => {
  it('accepts canonical quantities and money for an owner', () => {
    expect(
      validateProductForm(validProduct, { canManageSalePrice: true }),
    ).toEqual({ ok: true, data: validProduct });
  });

  it.each(['１２', '١٢', '1,000', '1 000', '01', '1.5', '1.000'])(
    'rejects a non-canonical minimum quantity %j',
    (minStockQty) => {
      const result = validateProductForm(
        { ...validProduct, minStockQty },
        { canManageSalePrice: true },
      );
      expect(result.ok).toBe(false);
    },
  );

  it.each(['１２', '1,000', '01', '1.234'])(
    'rejects a non-canonical sale price %j',
    (salePrice) => {
      const result = validateProductForm(
        { ...validProduct, salePrice },
        { canManageSalePrice: true },
      );
      expect(result.ok).toBe(false);
    },
  );

  it('rejects sale price submission without the owner permission', () => {
    const result = validateProductForm(validProduct, {
      canManageSalePrice: false,
    });
    expect(result).toEqual({
      ok: false,
      fieldErrors: {
        salePrice: 'Chỉ chủ cửa hàng được thay đổi giá bán.',
      },
    });
  });

  it('rejects overlong product text', () => {
    const result = validateProductForm(
      { ...validProduct, name: 'x'.repeat(201) },
      { canManageSalePrice: true },
    );
    expect(result.ok).toBe(false);
  });
});
