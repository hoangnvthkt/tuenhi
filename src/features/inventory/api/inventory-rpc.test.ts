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
  it('explains a blocked purchase reversal instead of suggesting a retry', async () => {
    rpc.mockResolvedValueOnce({
      error: null,
      data: {
        ok: false,
        data: null,
        error: {
          code: 'PURCHASE_REVERSAL_BLOCKED',
          message: 'Internal database detail must not be displayed',
          details: {},
        },
        correlationId: '00000000-0000-4000-8000-000000000001',
      },
    });
    await expect(
      createInventoryRpc()(
        'reverse_purchase_receipt',
        {},
        inventoryMutationSchema,
      ),
    ).rejects.toThrow('tồn kho đã phát sinh thay đổi');
  });

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
