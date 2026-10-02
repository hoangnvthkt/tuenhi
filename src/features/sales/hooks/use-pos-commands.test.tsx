import { act, renderHook, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  executeFinancialCommand,
  FinancialOutcomeUnknownError,
  FinancialTransportError,
  readPendingFinancialCommands,
} from '@/shared/api/financial-command';
import { ToastProvider } from '@/shared/ui/feedback/ToastProvider';
import type { SalesApi } from '../api/sales-api';
import type { Sale } from '../api/sales-schemas';
import {
  readPosCartSnapshot,
  writePosCartSnapshot,
} from '../model/pos-storage';
import { usePosCommands } from './use-pos-commands';

const mocks = vi.hoisted(() => ({
  runFinancialCommand: vi.fn(),
  upload: vi.fn(),
  remove: vi.fn(),
}));

vi.mock('@/shared/hooks/use-financial-command', () => ({
  useFinancialCommand: () => mocks.runFinancialCommand,
}));

vi.mock('@/features/payments', () => ({
  createPaymentProofApi: () => ({
    upload: mocks.upload,
    remove: mocks.remove,
  }),
}));

const userId = '10000000-0000-4000-8000-000000000001';
const saleId = '20000000-0000-4000-8000-000000000001';

const draft: Sale = {
  id: saleId,
  saleNumber: null,
  status: 'DRAFT',
  customerId: null,
  salesChannelId: '40000000-0000-4000-8000-000000000001',
  subtotal: '100000',
  lineDiscountTotal: '0',
  orderDiscountTotal: '0',
  discountTotal: '0',
  netTotal: '100000',
  note: null,
  createdBy: userId,
  version: 2,
  createdAt: '2026-08-28T00:00:00.000Z',
  updatedAt: '2026-08-28T00:00:00.000Z',
  lines: [],
};

function wrapper({ children }: { children: ReactNode }) {
  return (
    <MemoryRouter>
      <QueryClientProvider client={new QueryClient()}>
        <ToastProvider>{children}</ToastProvider>
      </QueryClientProvider>
    </MemoryRouter>
  );
}

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
});

describe('usePosCommands', () => {
  it('saves and reads the scoped provisional document at zero stock without payment', async () => {
    const savedDraft = { ...draft, version: 3 };
    const document = { kind: 'PROVISIONAL', totals: { netTotal: '97000' } };
    const saveDraft = vi
      .fn()
      .mockResolvedValue({ sale: savedDraft, priceRefreshed: true });
    const draftPrint = vi.fn().mockResolvedValue(document);
    const complete = vi.fn();
    const { result } = renderHook(
      () =>
        usePosCommands({
          api: { saveDraft, draftPrint, complete } as unknown as SalesApi,
          online: true,
          userId,
          saleId,
          draft,
          items: [
            {
              productId: '50000000-0000-4000-8000-000000000001',
              productName: 'Sữa hộp',
              sku: 'SUA',
              unitName: 'Hộp',
              quantity: '2',
              unitSalePrice: '50000',
              lineDiscountAmount: '3000',
              lineOrder: 0,
              onHandQty: '0',
            },
          ],
          customerId: '',
          channelId: draft.salesChannelId,
          orderDiscount: '0',
          note: 'Giao buổi chiều',
          canDiscount: true,
          payment: null,
          setDraft: vi.fn(),
          setItems: vi.fn(),
          setPayment: vi.fn(),
        }),
      { wrapper },
    );
    await act(() => result.current.preparePrint());
    expect(saveDraft).toHaveBeenCalledWith(
      expect.objectContaining({
        saleId,
        expectedVersion: 2,
        note: 'Giao buổi chiều',
      }),
    );
    expect(draftPrint).toHaveBeenCalledWith(saleId);
    expect(result.current.provisionalDocument).toEqual(document);
    expect(complete).not.toHaveBeenCalled();
    expect(mocks.runFinancialCommand).not.toHaveBeenCalled();
    expect(mocks.upload).not.toHaveBeenCalled();
  });

  it('reconciles a pending completion without saving the draft again', async () => {
    await expect(
      executeFinancialCommand({
        userId,
        commandName: 'sale.complete',
        entityId: saleId,
        createId: () => '30000000-0000-4000-8000-000000000001',
        invoke: async () => {
          throw new FinancialTransportError();
        },
        lookup: async () => ({ status: 'NOT_FOUND', response: null }),
        parseCachedResponse: (response) => response as never,
        isOnline: () => false,
        wait: async () => undefined,
      }),
    ).rejects.toBeInstanceOf(FinancialOutcomeUnknownError);

    const saveDraft = vi.fn();
    const complete = vi.fn().mockResolvedValue({
      saleId,
      saleNumber: 'HD000001',
      status: 'COMPLETED',
      version: 3,
    });
    mocks.runFinancialCommand.mockImplementation(
      async ({ invoke }: { invoke: (key: string) => Promise<unknown> }) =>
        invoke('30000000-0000-4000-8000-000000000001'),
    );
    writePosCartSnapshot({
      version: 2,
      userId,
      identity: { kind: 'DRAFT', saleId },
      serverVersion: draft.version,
      revision: 1,
      updatedAt: '2026-08-31T07:00:00.000Z',
      lastWriterTabId: '60000000-0000-4000-8000-000000000001',
      items: [],
      channelId: draft.salesChannelId,
      customerId: '',
      orderDiscount: '0',
      note: '',
    });

    const { result } = renderHook(
      () =>
        usePosCommands({
          api: { saveDraft, complete } as unknown as SalesApi,
          online: true,
          userId,
          saleId,
          draft,
          items: [
            {
              productId: '50000000-0000-4000-8000-000000000001',
              productName: 'Sản phẩm thử',
              sku: 'SP001',
              unitName: 'cái',
              quantity: '1',
              unitSalePrice: '100000',
              lineDiscountAmount: '0',
              lineOrder: 0,
              onHandQty: '10',
            },
          ],
          customerId: '',
          channelId: draft.salesChannelId,
          orderDiscount: '0',
          note: '',
          canDiscount: true,
          payment: 'CASH',
          setDraft: vi.fn(),
          setItems: vi.fn(),
          setPayment: vi.fn(),
        }),
      { wrapper },
    );

    await act(() => result.current.pay());

    expect(saveDraft).not.toHaveBeenCalled();
    expect(complete).toHaveBeenCalledWith(
      saleId,
      draft.version,
      'CASH',
      '30000000-0000-4000-8000-000000000001',
      undefined,
    );
    expect(
      readPosCartSnapshot(userId, { kind: 'DRAFT', saleId }),
    ).toBeUndefined();
  });

  it('uploads a bank-transfer proof once across same-key invocations', async () => {
    const savedDraft = { ...draft, lines: [] };
    const saveDraft = vi.fn().mockResolvedValue({
      sale: savedDraft,
      priceRefreshed: false,
    });
    const complete = vi.fn().mockResolvedValue({
      saleId,
      saleNumber: 'HD000002',
      status: 'COMPLETED',
      version: 3,
    });
    mocks.upload.mockResolvedValue({ objectPath: `sales/${saleId}/proof.jpg` });
    mocks.runFinancialCommand.mockImplementation(
      async ({ invoke }: { invoke: (key: string) => Promise<unknown> }) => {
        await invoke('30000000-0000-4000-8000-000000000002');
        return invoke('30000000-0000-4000-8000-000000000002');
      },
    );

    const { result } = renderHook(
      () =>
        usePosCommands({
          api: { saveDraft, complete } as unknown as SalesApi,
          online: true,
          userId,
          saleId,
          draft,
          items: [
            {
              productId: '50000000-0000-4000-8000-000000000001',
              productName: 'Sản phẩm thử',
              sku: 'SP001',
              unitName: 'cái',
              quantity: '1',
              unitSalePrice: '100000',
              lineDiscountAmount: '0',
              lineOrder: 0,
              onHandQty: '10',
            },
          ],
          customerId: '',
          channelId: draft.salesChannelId,
          orderDiscount: '0',
          note: '',
          canDiscount: true,
          payment: 'BANK_TRANSFER',
          setDraft: vi.fn(),
          setItems: vi.fn(),
          setPayment: vi.fn(),
        }),
      { wrapper },
    );
    const proof = new File(['proof'], 'proof.jpg', { type: 'image/jpeg' });

    await act(() => result.current.pay(proof));

    expect(mocks.upload).toHaveBeenCalledTimes(1);
    expect(complete).toHaveBeenCalledTimes(2);
    expect(complete).toHaveBeenNthCalledWith(
      1,
      saleId,
      draft.version,
      'BANK_TRANSFER',
      '30000000-0000-4000-8000-000000000002',
      `sales/${saleId}/proof.jpg`,
    );
    expect(complete).toHaveBeenNthCalledWith(
      2,
      saleId,
      draft.version,
      'BANK_TRANSFER',
      '30000000-0000-4000-8000-000000000002',
      `sales/${saleId}/proof.jpg`,
    );
  });

  it('clears the pre-command marker when proof upload definitively fails', async () => {
    const saveDraft = vi.fn().mockResolvedValue({
      sale: draft,
      priceRefreshed: false,
    });
    const complete = vi.fn();
    mocks.upload.mockRejectedValue(new Error('storage unavailable'));
    mocks.runFinancialCommand.mockImplementation(
      (input: Parameters<typeof executeFinancialCommand>[0]) =>
        executeFinancialCommand({
          ...input,
          userId,
          lookup: async () => ({ status: 'NOT_FOUND', response: null }),
          wait: async () => undefined,
        }),
    );

    const { result } = renderHook(
      () =>
        usePosCommands({
          api: { saveDraft, complete } as unknown as SalesApi,
          online: true,
          userId,
          saleId,
          draft,
          items: [
            {
              productId: '50000000-0000-4000-8000-000000000001',
              productName: 'Sản phẩm thử',
              sku: 'SP001',
              unitName: 'cái',
              quantity: '1',
              unitSalePrice: '100000',
              lineDiscountAmount: '0',
              lineOrder: 0,
              onHandQty: '10',
            },
          ],
          customerId: '',
          channelId: draft.salesChannelId,
          orderDiscount: '0',
          note: '',
          canDiscount: true,
          payment: 'BANK_TRANSFER',
          setDraft: vi.fn(),
          setItems: vi.fn(),
          setPayment: vi.fn(),
        }),
      { wrapper },
    );

    await act(() =>
      result.current.pay(
        new File(['proof'], 'proof.jpg', { type: 'image/jpeg' }),
      ),
    );

    expect(complete).not.toHaveBeenCalled();
    expect(readPendingFinancialCommands()).toEqual([]);
    expect(
      screen.getByText('Không thể tải ảnh chứng từ. Giao dịch chưa được gửi.'),
    ).toBeVisible();
  });

  it('shows a safe toast when the pending marker cannot be read', async () => {
    const saveDraft = vi.fn();
    const storageRead = vi
      .spyOn(Storage.prototype, 'getItem')
      .mockImplementation(() => {
        throw new Error('blocked storage');
      });
    const { result } = renderHook(
      () =>
        usePosCommands({
          api: { saveDraft } as unknown as SalesApi,
          online: true,
          userId,
          saleId,
          draft,
          items: [],
          customerId: '',
          channelId: draft.salesChannelId,
          orderDiscount: '0',
          note: '',
          canDiscount: true,
          payment: 'CASH',
          setDraft: vi.fn(),
          setItems: vi.fn(),
          setPayment: vi.fn(),
        }),
      { wrapper },
    );

    try {
      await act(() => result.current.pay());
      expect(saveDraft).not.toHaveBeenCalled();
      expect(
        screen.getByText(
          'Không thể lưu mã yêu cầu an toàn trên thiết bị. Giao dịch chưa được gửi.',
        ),
      ).toBeVisible();
    } finally {
      storageRead.mockRestore();
    }
  });
});
