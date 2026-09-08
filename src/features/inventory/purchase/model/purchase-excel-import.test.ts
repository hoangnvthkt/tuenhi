import { describe, expect, it, vi } from 'vitest';
import { validatePurchaseReceiptRows } from './purchase-excel-import';

const productId = '10000000-0000-4000-8000-000000000001';

describe('validatePurchaseReceiptRows', () => {
  it('blocks every row when any row is invalid', async () => {
    const resolveProducts = vi.fn().mockResolvedValue([
      {
        requestedSku: 'SP-001',
        productId,
        sku: 'SP-001',
        productName: 'Sản phẩm A',
        unitName: 'Hộp',
        isActive: true,
      },
      {
        requestedSku: 'SP-002',
        productId: '10000000-0000-4000-8000-000000000002',
        sku: 'SP-002',
        productName: 'Sản phẩm B',
        unitName: 'Hộp',
        isActive: true,
      },
    ]);

    const result = await validatePurchaseReceiptRows({
      headers: ['SKU', 'Số lượng nhận', 'Đơn giá nhập'],
      rows: [
        { rowNumber: 2, cells: ['SP-001', '2', '12500'] },
        { rowNumber: 3, cells: ['SP-002', '0', '12500'] },
      ],
      existingProductIds: new Set(),
      resolveProducts,
    });

    expect(result.canApply).toBe(false);
    expect(result.lines).toEqual([]);
    expect(result.rows[1]?.issue).toMatch(/Số lượng/);
  });

  it('returns every resolved line only when the file is entirely valid', async () => {
    const resolveProducts = vi.fn().mockResolvedValue([
      {
        requestedSku: 'SP-001',
        productId,
        sku: 'SP-001',
        productName: 'Sản phẩm A',
        unitName: 'Hộp',
        isActive: true,
      },
    ]);

    const result = await validatePurchaseReceiptRows({
      headers: ['SKU', 'Số lượng nhận', 'Đơn giá nhập'],
      rows: [{ rowNumber: 2, cells: ['SP-001', '2', '12500.50'] }],
      existingProductIds: new Set(),
      resolveProducts,
    });

    expect(result).toMatchObject({
      canApply: true,
      lines: [{ productId, receivedQty: '2', unitCost: '12500.50' }],
    });
  });
});
