import { describe, expect, it, vi } from 'vitest';
import { FinancialTransportError } from '@/shared/api/financial-command';
import { invoiceFixture } from '../testing/invoice-fixture';
import { draftPrintFixture } from '../testing/draft-print-fixture';
import { createSalesApi, SalesApiError } from './sales-api';

const rpc = vi.fn().mockResolvedValue({
  data: null,
  error: { message: 'network failed' },
});

vi.mock('@/shared/supabase/client', () => ({
  getSupabaseClient: () => ({ rpc }),
}));

describe('SalesApi', () => {
  it('preserves the official version 2 invoice contract', async () => {
    rpc.mockResolvedValueOnce({
      data: {
        ok: true,
        data: invoiceFixture,
        error: null,
        correlationId: '90000000-0000-4000-8000-000000000001',
      },
      error: null,
    });
    expect(await createSalesApi().invoice(invoiceFixture.sale.id)).toEqual(
      invoiceFixture,
    );
  });

  it('reads a separate provisional DTO and rejects a completed document', async () => {
    const envelope = {
      ok: true,
      data: draftPrintFixture,
      error: null,
      correlationId: '90000000-0000-4000-8000-000000000001',
    };
    rpc.mockResolvedValueOnce({ data: envelope, error: null });
    expect(
      await createSalesApi().draftPrint(draftPrintFixture.draft.id),
    ).toEqual(draftPrintFixture);
    expect(rpc).toHaveBeenLastCalledWith('get_sale_draft_print', {
      p_sale_id: draftPrintFixture.draft.id,
    });
    rpc.mockResolvedValueOnce({
      data: {
        ...envelope,
        data: {
          ...draftPrintFixture,
          draft: { ...draftPrintFixture.draft, status: 'COMPLETED' },
        },
      },
      error: null,
    });
    await expect(
      createSalesApi().draftPrint(draftPrintFixture.draft.id),
    ).rejects.toThrow('Phản hồi bán hàng từ máy chủ không hợp lệ.');
  });
  it('surfaces denied draft scope without constructing a printable document', async () => {
    rpc.mockResolvedValueOnce({
      data: {
        ok: false,
        data: null,
        error: { code: 'PERMISSION_DENIED', message: 'forbidden', details: {} },
        correlationId: '90000000-0000-4000-8000-000000000001',
      },
      error: null,
    });
    await expect(
      createSalesApi().draftPrint(draftPrintFixture.draft.id),
    ).rejects.toBeInstanceOf(SalesApiError);
  });

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
