import { beforeEach, expect, it, vi } from 'vitest';
import {
  createCustomerDebtApi,
  CustomerDebtApiError,
} from './customer-debt-api';
import { FinancialTransportError } from '@/shared/api/financial-command';
const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock('@/shared/supabase/client', () => ({
  getSupabaseClient: () => ({ rpc: mocks.rpc }),
}));
const customerId = '40000000-0000-4000-8000-000000000001',
  key = '50000000-0000-4000-8000-000000000001';
const debt = { customerId, balance: '20000.00', version: 2 };
const result = { ...debt, balance: '0.00', version: 3, entryId: key };
const envelope = (data: unknown) => ({
  data: { ok: true, data, error: null, correlationId: key },
  error: null,
});
beforeEach(() => vi.clearAllMocks());
it('reads the authoritative customer balance', async () => {
  mocks.rpc.mockResolvedValue(envelope(debt));
  expect(await createCustomerDebtApi().detail(customerId)).toEqual(debt);
  expect(mocks.rpc).toHaveBeenCalledWith('get_customer_debt', {
    p_customer_id: customerId,
  });
});
it('records one collection with exact amounts and version', async () => {
  mocks.rpc.mockResolvedValue(envelope(result));
  expect(
    await createCustomerDebtApi().collect({
      customerId,
      expectedVersion: 2,
      cashAmount: '0',
      bankTransferAmount: '20000',
      note: 'Khách trả',
      idempotencyKey: key,
    }),
  ).toEqual(result);
  expect(mocks.rpc).toHaveBeenCalledWith('collect_customer_debt', {
    p_customer_id: customerId,
    p_expected_version: 2,
    p_cash_amount: '0',
    p_bank_transfer_amount: '20000',
    p_note: 'Khách trả',
    p_idempotency_key: key,
  });
});
it('sends a reasoned adjustment without representing it as a collection', async () => {
  mocks.rpc.mockResolvedValue(envelope(result));
  await createCustomerDebtApi().adjust({
    customerId,
    expectedVersion: 2,
    newBalance: '0',
    reason: 'Đối soát nợ cũ',
    idempotencyKey: key,
  });
  expect(mocks.rpc).toHaveBeenCalledWith('adjust_customer_debt', {
    p_customer_id: customerId,
    p_expected_version: 2,
    p_new_balance: '0',
    p_reason: 'Đối soát nợ cũ',
    p_idempotency_key: key,
  });
});
it('distinguishes business rejection from an unknown transport outcome', async () => {
  mocks.rpc.mockResolvedValueOnce({
    data: {
      ok: false,
      data: null,
      error: { code: 'VERSION_CONFLICT', message: 'raw', details: {} },
      correlationId: key,
    },
    error: null,
  });
  await expect(
    createCustomerDebtApi().collect({
      customerId,
      expectedVersion: 2,
      cashAmount: '1',
      bankTransferAmount: '0',
      note: '',
      idempotencyKey: key,
    }),
  ).rejects.toBeInstanceOf(CustomerDebtApiError);
  mocks.rpc.mockResolvedValueOnce({ data: null, error: { message: 'raw' } });
  await expect(
    createCustomerDebtApi().detail(customerId),
  ).rejects.toBeInstanceOf(FinancialTransportError);
});
