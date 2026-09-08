import { beforeEach, describe, expect, it, vi } from 'vitest';

const rpc = vi.fn();

vi.mock('../../api/inventory-rpc', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../api/inventory-rpc')>();
  return { ...actual, createInventoryRpc: () => rpc };
});

import { createPurchaseApi } from './purchase-api';

const receiptId = '10000000-0000-4000-8000-000000000001';
const productId = '10000000-0000-4000-8000-000000000002';
const key = '10000000-0000-4000-8000-000000000003';

describe('PurchaseApi', () => {
  beforeEach(() => rpc.mockReset());
  it('saves unit cost with each draft line', () => {
    const api = createPurchaseApi();

    api.save({
      receivedAt: '2026-09-08T08:00:00.000Z',
      note: '',
      idempotencyKey: key,
      lines: [{ productId, receivedQty: '2', unitCost: '12500.50' }],
    });

    expect(rpc).toHaveBeenCalledWith(
      'save_purchase_receipt_draft',
      expect.objectContaining({
        p_lines: [{ productId, receivedQty: '2', unitCost: '12500.50' }],
      }),
      expect.anything(),
    );
  });

  it('posts a priced draft without sending client-owned costs', () => {
    const api = createPurchaseApi();

    api.post(receiptId, 2, key);

    expect(rpc).toHaveBeenCalledWith(
      'post_purchase_receipt',
      expect.objectContaining({
        p_receipt_id: receiptId,
        p_expected_version: 2,
        p_cost_lines: [],
        p_idempotency_key: key,
      }),
      expect.anything(),
    );
  });

  it('does not call the SKU resolver for an empty import', async () => {
    const api = createPurchaseApi();

    await expect(api.resolveProductsBySku([])).resolves.toEqual([]);

    expect(rpc).not.toHaveBeenCalled();
  });
});
