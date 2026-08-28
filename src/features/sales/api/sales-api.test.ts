import { describe, expect, it, vi } from 'vitest';
import { FinancialTransportError } from '@/shared/api/financial-command';
import { createSalesApi } from './sales-api';

const rpc = vi.fn().mockResolvedValue({
  data: null,
  error: { message: 'network failed' },
});

vi.mock('@/shared/supabase/client', () => ({
  getSupabaseClient: () => ({ rpc }),
}));

describe('SalesApi', () => {
  it('classifies an unsuccessful financial RPC as an unknown transport outcome', async () => {
    await expect(
      createSalesApi().complete(
        '10000000-0000-4000-8000-000000000001',
        1,
        'CASH',
        '20000000-0000-4000-8000-000000000001',
      ),
    ).rejects.toBeInstanceOf(FinancialTransportError);
  });
});
