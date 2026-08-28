import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FinancialTransportError } from './financial-command';
import { createFinancialOutcomeApi } from './financial-outcome-api';

const rpc = vi.fn();

vi.mock('@/shared/supabase/client', () => ({
  getSupabaseClient: () => ({ rpc }),
}));

describe('FinancialOutcomeApi', () => {
  beforeEach(() => rpc.mockReset());

  it('returns the resolved status from a valid command envelope', async () => {
    rpc.mockResolvedValue({
      data: {
        ok: true,
        data: { status: 'RESOLVED', response: { ok: true } },
        error: null,
        correlationId: '10000000-0000-4000-8000-000000000001',
      },
      error: null,
    });

    await expect(
      createFinancialOutcomeApi().lookup(
        'sale.complete',
        '20000000-0000-4000-8000-000000000001',
      ),
    ).resolves.toEqual({ status: 'RESOLVED', response: { ok: true } });
  });

  it('classifies an RPC transport failure as outcome unknown', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'network failed' } });

    await expect(
      createFinancialOutcomeApi().lookup(
        'sale.complete',
        '20000000-0000-4000-8000-000000000001',
      ),
    ).rejects.toBeInstanceOf(FinancialTransportError);
  });

  it('preserves a safe business code and correlation ID', async () => {
    rpc.mockResolvedValue({
      data: {
        ok: false,
        data: null,
        error: {
          code: 'AUTH_REQUIRED',
          message: 'raw private message',
          details: {},
        },
        correlationId: '10000000-0000-4000-8000-000000000002',
      },
      error: null,
    });

    await expect(
      createFinancialOutcomeApi().lookup(
        'sale.complete',
        '20000000-0000-4000-8000-000000000001',
      ),
    ).rejects.toMatchObject({
      code: 'AUTH_REQUIRED',
      correlationId: '10000000-0000-4000-8000-000000000002',
      message: 'Vui lòng đăng nhập để tiếp tục.',
    });
  });
});
