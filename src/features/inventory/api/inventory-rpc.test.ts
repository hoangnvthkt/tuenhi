import { describe, expect, it, vi } from 'vitest';
import { FinancialTransportError } from '@/shared/api/financial-command';
import { createInventoryRpc, inventoryMutationSchema } from './inventory-rpc';

const rpc = vi.fn().mockResolvedValue({
  data: null,
  error: { message: 'network failed' },
});

vi.mock('@/shared/supabase/client', () => ({
  getSupabaseClient: () => ({ rpc }),
}));

describe('createInventoryRpc', () => {
  it('classifies an unsuccessful posting RPC as an unknown transport outcome', async () => {
    await expect(
      createInventoryRpc()(
        'post_purchase_receipt',
        {},
        inventoryMutationSchema,
      ),
    ).rejects.toBeInstanceOf(FinancialTransportError);
  });
});
