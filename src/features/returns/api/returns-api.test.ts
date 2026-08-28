import { describe, expect, it, vi } from 'vitest';
import { FinancialTransportError } from '@/shared/api/financial-command';
import { createReturnsApi } from './returns-api';

const rpc = vi.fn().mockResolvedValue({
  data: null,
  error: { message: 'network failed' },
});

vi.mock('@/shared/supabase/client', () => ({
  getSupabaseClient: () => ({ rpc }),
}));

describe('ReturnsApi', () => {
  it('classifies an unsuccessful completion RPC as an unknown transport outcome', async () => {
    await expect(
      createReturnsApi().complete({
        returnId: '10000000-0000-4000-8000-000000000001',
        expectedVersion: 1,
        lines: [],
        refundMethod: 'CASH',
        idempotencyKey: '20000000-0000-4000-8000-000000000001',
      }),
    ).rejects.toBeInstanceOf(FinancialTransportError);
  });
});
