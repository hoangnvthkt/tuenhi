import { act, renderHook, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router';
import { useState, type ReactNode } from 'react';
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
import type { PosCartItem } from '../model/pos-types';
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
  lines: [
    {
      id: '70000000-0000-4000-8000-000000000001',
      productId: '50000000-0000-4000-8000-000000000001',
      productName: 'Sản phẩm thử',
      sku: 'SP001',
      unitName: 'cái',
      quantity: '1',
      unitSalePrice: '100000',
      grossAmount: '100000',
      lineDiscountAmount: '0',
      allocatedOrderDiscount: '0',
      netAmount: '100000',
      lineOrder: 0,
    },
  ],
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

  it('uploads a bank-transfer proof once across same-key invocations', async () => {
    const savedDraft = { ...draft };
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

function renderCheckout(api: SalesApi) {
  return renderHook(
    () => {
      const [currentDraft, setDraft] = useState<Sale | null>(draft);
      const [items, setItems] = useState<PosCartItem[]>(
        draft.lines.map((line) => ({ ...line, onHandQty: '10' })),
      );
      const [payment, setPayment] = useState<'CASH' | 'BANK_TRANSFER' | null>(
        'BANK_TRANSFER',
      );
      const commands = usePosCommands({
        api,
        online: true,
        userId,
        saleId,
        draft: currentDraft,
        items,
        customerId: '',
        channelId: draft.salesChannelId,
        orderDiscount: '0',
        note: '',
        canDiscount: true,
        payment,
        setDraft,
        setItems,
        setPayment,
      });
      return { ...commands, items, payment, setPayment, setItems };
    },
    { wrapper },
  );
}

it('stops changed prices before proof upload, then completes only after another confirmation', async () => {
  const repriced = {
    ...draft,
    version: 3,
    subtotal: '120000',
    netTotal: '120000',
    lines: draft.lines.map((line) => ({
      ...line,
      unitSalePrice: '120000',
      grossAmount: '120000',
      netAmount: '120000',
    })),
  };
  const saveDraft = vi
    .fn()
    .mockResolvedValue({ sale: repriced, priceRefreshed: true });
  const complete = vi.fn().mockResolvedValue({
    saleId,
    saleNumber: 'HD1',
    status: 'COMPLETED',
    version: 4,
  });
  mocks.upload.mockResolvedValue({ objectPath: 'proof.jpg' });
  mocks.runFinancialCommand.mockImplementation(async ({ invoke }) =>
    invoke('same-operation-key'),
  );
  const { result } = renderCheckout({
    saveDraft,
    complete,
  } as unknown as SalesApi);
  const proof = new File(['proof'], 'proof.jpg', { type: 'image/jpeg' });
  await act(() => result.current.pay(proof));
  expect(complete).not.toHaveBeenCalled();
  expect(mocks.upload).not.toHaveBeenCalled();
  expect(result.current.items[0]?.unitSalePrice).toBe('120000');
  expect(result.current.payment).toBeNull();
  expect(screen.getByText(/Giá đã thay đổi/)).toBeVisible();
  act(() => result.current.setPayment('BANK_TRANSFER'));
  await act(() => result.current.pay(proof));
  expect(complete).toHaveBeenCalledWith(
    saleId,
    3,
    'BANK_TRANSFER',
    'same-operation-key',
    'proof.jpg',
  );
});

it('does not block an unchanged price even if save reports priceRefreshed', async () => {
  const saveDraft = vi.fn().mockResolvedValue({
    sale: {
      ...draft,
      netTotal: '100000.00',
      lines: draft.lines.map((line) => ({
        ...line,
        unitSalePrice: '100000.00',
      })),
    },
    priceRefreshed: true,
  });
  const complete = vi.fn().mockResolvedValue({ saleId, saleNumber: 'HD2' });
  mocks.runFinancialCommand.mockImplementation(async ({ invoke }) =>
    invoke('key'),
  );
  const { result } = renderCheckout({
    saveDraft,
    complete,
  } as unknown as SalesApi);
  act(() => result.current.setPayment('CASH'));
  await act(() => result.current.pay());
  expect(complete).toHaveBeenCalledOnce();
});

for (const recovered of [false, true]) {
  it(`recovers original checkout after attempted edits (cached=${recovered})`, async () => {
    let online = false;
    const response = {
      saleId,
      saleNumber: 'HD1',
      status: 'COMPLETED',
      version: 3,
    };
    const complete = vi.fn().mockRejectedValue(new FinancialTransportError());
    const saveDraft = vi
      .fn()
      .mockResolvedValue({ sale: draft, priceRefreshed: false });
    mocks.upload.mockResolvedValue({ objectPath: 'original-proof.jpg' });
    mocks.runFinancialCommand.mockImplementation((input) =>
      executeFinancialCommand({
        ...input,
        userId,
        wait: async () => undefined,
        isOnline: () => online,
        lookup: async () =>
          recovered && online
            ? { status: 'RESOLVED', response }
            : { status: 'NOT_FOUND', response: null },
      }),
    );
    const { result } = renderCheckout({
      saveDraft,
      complete,
      parseCompleteResponse: (value: unknown) => value,
    } as unknown as SalesApi);
    await act(() =>
      result.current.pay(
        new File(['proof'], 'proof.jpg', { type: 'image/jpeg' }),
      ),
    );
    expect(readPendingFinancialCommands()).toHaveLength(1);
    expect(result.current.checkoutPending).toBe(true);
    expect(mocks.remove).not.toHaveBeenCalled();
    const originalKey = complete.mock.calls[0]?.[3];
    act(() => {
      result.current.setItems((items) =>
        items.map((item) => ({ ...item, quantity: '2' })),
      );
      result.current.setPayment('CASH');
    });
    await act(() => result.current.pay());
    await act(() => result.current.save());
    expect(saveDraft).toHaveBeenCalledTimes(1);
    online = true;
    complete.mockResolvedValue(response);
    await act(() => result.current.reconcilePayment());
    expect(saveDraft).toHaveBeenCalledTimes(1);
    expect(mocks.upload).toHaveBeenCalledTimes(1);
    expect(complete).toHaveBeenCalledTimes(recovered ? 1 : 2);
    if (!recovered)
      expect(complete).toHaveBeenLastCalledWith(
        saleId,
        draft.version,
        'BANK_TRANSFER',
        originalKey,
        'original-proof.jpg',
      );
    expect(readPendingFinancialCommands()).toEqual([]);
  });
}

it('only looks up a pending checkout after reload without inventing its payment method', async () => {
  await expect(
    executeFinancialCommand({
      userId,
      commandName: 'sale.complete',
      entityId: saleId,
      invoke: async () => {
        throw new FinancialTransportError();
      },
      lookup: async () => ({ status: 'NOT_FOUND', response: null }),
      parseCachedResponse: (value) => value,
      isOnline: () => false,
      wait: async () => undefined,
    }),
  ).rejects.toBeInstanceOf(FinancialOutcomeUnknownError);
  const key = readPendingFinancialCommands()[0]!.idempotencyKey;
  const complete = vi.fn();
  const saveDraft = vi.fn();
  mocks.runFinancialCommand.mockImplementation((input) =>
    executeFinancialCommand({
      ...input,
      userId,
      wait: async () => undefined,
      lookup: async () => ({ status: 'NOT_FOUND', response: null }),
    }),
  );
  const { result } = renderCheckout({
    saveDraft,
    complete,
    parseCompleteResponse: (value: unknown) => value,
  } as unknown as SalesApi);
  await act(() => result.current.reconcilePayment());
  expect(complete).not.toHaveBeenCalled();
  expect(saveDraft).not.toHaveBeenCalled();
  expect(result.current.checkoutPending).toBe(true);
  expect(readPendingFinancialCommands()[0]?.idempotencyKey).toBe(key);
});
