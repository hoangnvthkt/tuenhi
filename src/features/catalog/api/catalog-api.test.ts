import { describe, expect, it } from 'vitest';
import {
  CatalogApiError,
  parseCatalogPageEnvelope,
  parseMutationEnvelope,
} from './catalog-api';

describe('catalog API boundary', () => {
  it('accepts a typed catalog cursor envelope', () => {
    const data = parseCatalogPageEnvelope({
      ok: true,
      data: {
        items: [
          {
            id: '10000000-0000-4000-8000-000000000001',
            sku: 'SP-001',
            barcode: null,
            name: 'Sản phẩm mẫu',
            categoryId: null,
            categoryName: null,
            unitName: 'Hộp',
            minStockQty: '0',
            effectiveMinStockQty: '50',
            isActive: true,
            version: 1,
            primaryImagePath: null,
            currentSalePrice: '25000.00',
            onHandQty: '0',
          },
        ],
        nextCursor: {
          name: 'sản phẩm mẫu',
          id: '10000000-0000-4000-8000-000000000001',
        },
      },
      error: null,
      correlationId: '20000000-0000-4000-8000-000000000002',
    });

    expect(data.items[0]?.sku).toBe('SP-001');
    expect(data.items[0]).toMatchObject({
      minStockQty: '0',
      effectiveMinStockQty: '50',
    });
  });

  it('rejects a malformed server envelope without exposing raw data', () => {
    expect(() =>
      parseCatalogPageEnvelope({ ok: true, data: { items: 'invalid' } }),
    ).toThrow('Phản hồi danh mục không hợp lệ.');
  });

  it('preserves a safe business code and correlation ID', () => {
    expect(() =>
      parseMutationEnvelope({
        ok: false,
        data: null,
        error: {
          code: 'VERSION_CONFLICT',
          message: 'raw database text must not be shown',
          details: { currentVersion: 3 },
        },
        correlationId: '20000000-0000-4000-8000-000000000002',
      }),
    ).toThrow(CatalogApiError);

    try {
      parseMutationEnvelope({
        ok: false,
        data: null,
        error: {
          code: 'VERSION_CONFLICT',
          message: 'raw database text must not be shown',
          details: { currentVersion: 3 },
        },
        correlationId: '20000000-0000-4000-8000-000000000002',
      });
    } catch (error) {
      expect(error).toMatchObject({
        code: 'VERSION_CONFLICT',
        correlationId: '20000000-0000-4000-8000-000000000002',
        details: { currentVersion: 3 },
      });
      expect((error as Error).message).not.toContain('raw database');
    }
  });
});
