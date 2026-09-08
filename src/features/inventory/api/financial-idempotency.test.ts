import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createOpeningApi } from '../opening/api/opening-api';
import { createPurchaseApi } from '../purchase/api/purchase-api';
import { createStockCountApi } from '../stock-count/api/stock-count-api';

const rpc = vi.fn().mockResolvedValue({
  data: {
    ok: true,
    data: {},
    error: null,
    correlationId: '10000000-0000-4000-8000-000000000001',
  },
  error: null,
});

vi.mock('@/shared/supabase/client', () => ({
  getSupabaseClient: () => ({ rpc }),
}));

describe('financial inventory idempotency keys', () => {
  beforeEach(() => rpc.mockClear());

  it('forwards the supplied key when posting and reversing a purchase', async () => {
    const api = createPurchaseApi();

    await api.post('receipt-id', 2, 'purchase-post-key');
    await api.command(
      'reverse',
      'receipt-id',
      2,
      'Owner đảo phiếu',
      'purchase-reverse-key',
    );

    expect(rpc).toHaveBeenNthCalledWith(
      1,
      'post_purchase_receipt',
      expect.objectContaining({ p_idempotency_key: 'purchase-post-key' }),
    );
    expect(rpc).toHaveBeenNthCalledWith(
      2,
      'reverse_purchase_receipt',
      expect.objectContaining({ p_idempotency_key: 'purchase-reverse-key' }),
    );
  });

  it('forwards the supplied key when posting a stock count', async () => {
    await createStockCountApi().post('count-id', 3, [], 'stock-post-key');

    expect(rpc).toHaveBeenCalledWith(
      'post_stock_count',
      expect.objectContaining({ p_idempotency_key: 'stock-post-key' }),
    );
  });

  it('forwards the supplied key when posting opening stock', async () => {
    await createOpeningApi().command(
      'post',
      'opening-id',
      4,
      '',
      'opening-post-key',
    );

    expect(rpc).toHaveBeenCalledWith(
      'post_opening_stock',
      expect.objectContaining({ p_idempotency_key: 'opening-post-key' }),
    );
  });
});
