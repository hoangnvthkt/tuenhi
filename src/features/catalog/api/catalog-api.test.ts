import { describe, expect, it } from 'vitest';
import {
  CatalogApiError,
  parseCatalogPageEnvelope,
  parseMutationEnvelope,
} from './catalog-api';

function catalogEnvelope(onHandQty: string, minStockQty = '0') {
  return {
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
          minStockQty,
          effectiveMinStockQty: '50',
          isActive: true,
          version: 1,
          primaryImagePath: null,
          currentSalePrice: '25000.00',
          onHandQty,
        },
      ],
      nextCursor: null,
    },
    error: null,
    correlationId: '20000000-0000-4000-8000-000000000002',
  };
}

describe('catalog API boundary', () => {
  it.each(['-1', '-100000000000000000', '0', '2'])(
    'accepts signed canonical on-hand stock %s',
    (onHandQty) => {
      expect(
        parseCatalogPageEnvelope(catalogEnvelope(onHandQty)).items[0]
          ?.onHandQty,
      ).toBe(onHandQty);
    },
  );

  it.each(['-0', '-01', '+1', '1.0', '-1.5', '01', ' 1', '1e3'])(
    'rejects malformed on-hand stock %j',
    (onHandQty) => {
      expect(() =>
        parseCatalogPageEnvelope(catalogEnvelope(onHandQty)),
      ).toThrow('Phản hồi danh mục không hợp lệ.');
    },
  );

  it('keeps the minimum stock threshold nonnegative', () => {
    expect(() => parseCatalogPageEnvelope(catalogEnvelope('-1', '-1'))).toThrow(
      'Phản hồi danh mục không hợp lệ.',
    );
  });

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
