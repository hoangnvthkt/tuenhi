import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock('@/shared/supabase/client', () => ({ getSupabaseClient: () => mocks }));
import { createCatalogApi, parseCatalogPageEnvelope } from './catalog-api';
const id = '10000000-0000-4000-8000-000000000001';
const envelope = (data: unknown) => ({
  ok: true,
  data,
  error: null,
  correlationId: id,
});
const values = {
  sku: 'NEW',
  barcode: '',
  name: 'New',
  unitName: 'Hộp',
  categoryId: '',
  description: '',
  minStockQty: '0',
  isActive: true,
};
beforeEach(() => {
  mocks.rpc.mockReset();
  mocks.rpc.mockResolvedValue({
    data: envelope({ productId: id, version: 1 }),
    error: null,
  });
});
it('sends default cost in the same product command, with the retry key', async () => {
  await createCatalogApi().saveProduct({
    values: { ...values, defaultCost: '30000.50' },
    idempotencyKey: id,
  });
  expect(mocks.rpc).toHaveBeenCalledWith(
    'save_product',
    expect.objectContaining({
      p_idempotency_key: id,
      p_product: { ...values, defaultCost: '30000.50' },
    }),
  );
});
it('omits an unauthorized/legacy default cost rather than clearing it', async () => {
  await createCatalogApi().saveProduct({ values, idempotencyKey: id });
  expect(mocks.rpc.mock.calls[0]![1].p_product).not.toHaveProperty(
    'defaultCost',
  );
});
it.each(['30000.50', null])(
  'preserves server-redacted/default cost %s in product search',
  (defaultCost) => {
    const data = parseCatalogPageEnvelope(
      envelope({
        items: [
          {
            id,
            sku: 'NEW',
            name: 'New',
            barcode: null,
            categoryId: null,
            categoryName: null,
            unitName: 'Hộp',
            minStockQty: '0',
            isActive: true,
            version: 1,
            primaryImagePath: null,
            currentSalePrice: '55000',
            onHandQty: '0',
            defaultCost,
          },
        ],
        nextCursor: null,
      }),
    );
    expect(data.items[0]).toHaveProperty('defaultCost', defaultCost);
  },
);
