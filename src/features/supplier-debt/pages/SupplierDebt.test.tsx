import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '@/shared/ui/feedback/ToastProvider';
import { PurchaseReturnPage } from './PurchaseReturnPage';
import { SupplierDebtPage } from './SupplierDebtPage';
import { SupplierPayPage } from './SupplierPayPage';
import { WriteOffPage } from './WriteOffPage';
import {
  allocateOldestFirst,
  returnLineAmount,
  writeOffValue,
} from '../model/supplier-money';

const userId = '10000000-0000-4000-8000-000000000001';
const key = '50000000-0000-4000-8000-000000000001';
const supplierId = '20000000-0000-4000-8000-000000000001';
const receiptId = '40000000-0000-4000-8000-000000000002';
const productId = '30000001-0000-4000-8000-000000000001';
const state = vi.hoisted(() => ({
  permissions: [] as string[],
  run: vi.fn(),
  api: {
    debts: vi.fn(),
    debt: vi.fn(),
    pay: vi.fn(),
    setOpening: vi.fn(),
    returnOptions: vi.fn(),
    postReturn: vi.fn(),
    writeOffProducts: vi.fn(),
    postWriteOff: vi.fn(),
    writeOffs: vi.fn(),
    parseMutation: vi.fn(),
    parseReturn: vi.fn(),
    parseWriteOff: vi.fn(),
  },
}));
vi.mock('@/features/auth', async (original) => ({
  ...(await original<typeof import('@/features/auth')>()),
  useSession: () => ({ session: { userId, permissions: state.permissions } }),
  usePrivateQueryKey:
    () =>
    (...parts: unknown[]) =>
      parts,
}));
vi.mock('@/features/catalog', () => ({
  ProductSelect: ({ onChange }: { onChange: (id: string) => void }) => (
    <button type="button" onClick={() => onChange(productId)}>
      Chọn 12B vàng
    </button>
  ),
}));
vi.mock('@/shared/hooks/use-online-status', () => ({
  useOnlineStatus: () => true,
}));
vi.mock('@/shared/hooks/use-financial-command', () => ({
  useFinancialCommand: () => state.run,
}));
vi.mock('../api/supplier-debt-api', async (original) => ({
  ...(await original<typeof import('../api/supplier-debt-api')>()),
  createSupplierDebtApi: () => state.api,
}));

const debt = {
  supplier: { id: supplierId, code: 'LC', name: 'Dược phẩm Long Châu' },
  balance: '250000.00',
  version: 3,
  hasOpening: false,
  openPayables: [
    {
      payableId: '60000000-0000-4000-8000-000000000001',
      kind: 'RECEIPT' as const,
      receiptId,
      receiptNumber: 'PN000002',
      openedAt: '2026-09-15T01:00:00Z',
      totalAmount: '200000.00',
      paidAmount: '0.00',
      returnedAmount: '0.00',
      outstandingAmount: '200000.00',
    },
    {
      payableId: '60000000-0000-4000-8000-000000000002',
      kind: 'RECEIPT' as const,
      receiptId: '40000000-0000-4000-8000-000000000003',
      receiptNumber: 'PN000004',
      openedAt: '2026-10-15T01:00:00Z',
      totalAmount: '50000.00',
      paidAmount: '0.00',
      returnedAmount: '0.00',
      outstandingAmount: '50000.00',
    },
  ],
  entries: [
    {
      id: '70000000-0000-4000-8000-000000000001',
      kind: 'RECEIPT_POSTED' as const,
      delta: '200000.00',
      balanceAfter: '200000.00',
      cashAmount: '0.00',
      bankTransferAmount: '0.00',
      note: null,
      receiptId,
      receiptNumber: 'PN000002',
      returnNumber: null,
      actorName: 'Admin',
      occurredAt: '2026-09-15T01:00:00Z',
    },
  ],
};

function Location() {
  const location = useLocation();
  return (
    <output aria-label="Địa chỉ">{location.pathname + location.search}</output>
  );
}
function renderAt(path: string) {
  return render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <ToastProvider>
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route path="/more/supplier-debts" element={<SupplierDebtPage />} />
            <Route
              path="/more/supplier-debts/:supplierId/pay"
              element={<SupplierPayPage />}
            />
            <Route
              path="/more/purchases/:receiptId/return"
              element={<PurchaseReturnPage />}
            />
            <Route path="/more/write-offs" element={<WriteOffPage />} />
          </Routes>
          <Location />
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  state.permissions = [
    'supplier.debt.read',
    'supplier.debt.pay',
    'supplier.debt.adjust',
    'purchase.return.post',
    'inventory.writeoff.post',
  ];
  state.run.mockImplementation(async ({ invoke }) => invoke(key));
  state.api.debts.mockResolvedValue({
    summary: {
      totalPayable: '250000.00',
      supplierCount: 1,
      openPayableCount: 2,
      paidThisMonth: '0',
      returnedThisMonth: '0',
      returnCountThisMonth: 0,
    },
    items: [
      {
        supplierId,
        code: 'LC',
        name: 'Dược phẩm Long Châu',
        balance: '250000.00',
        openCount: 2,
        oldestOpenAt: '2026-09-15T01:00:00Z',
        version: 3,
      },
    ],
  });
  state.api.debt.mockResolvedValue(debt);
  state.api.writeOffs.mockResolvedValue({ items: [] });
});

describe('supplier money rules', () => {
  it('splits a return like the server: rounded share, last units take the rest', () => {
    const line = {
      lineCost: '1000.00',
      receivedQty: '3',
      returnedQty: '0',
      returnedAmount: '0',
    };
    expect(returnLineAmount({ ...line, quantity: '1' })).toBe('333.33');
    expect(returnLineAmount({ ...line, quantity: '2' })).toBe('666.67');
    expect(
      returnLineAmount({
        ...line,
        returnedQty: '2',
        returnedAmount: '666.67',
        quantity: '1',
      }),
    ).toBe('333.33');
  });
  it('pays the oldest payable first', () => {
    expect(
      allocateOldestFirst(debt.openPayables, '230000').map((x) => x.amount),
    ).toEqual(['200000', '30000']);
  });
  it('previews the exact write-off value', () => {
    const input = {
      avgUnitCostExact: '333.333333',
      inventoryValue: '1000.00',
      onHandQty: '3',
    };
    expect(writeOffValue({ ...input, quantity: '1' })).toBe('333.33');
    expect(writeOffValue({ ...input, quantity: '3' })).toBe('1000.00');
  });
});

describe('SupplierDebtPage', () => {
  it('shows what is owed per receipt and saves an opening debt with a reason', async () => {
    const user = userEvent.setup();
    state.api.setOpening.mockResolvedValue({
      supplierId,
      balance: '300000',
      version: 4,
    });
    renderAt('/more/supplier-debts');
    // Open receipts and the history both link the receipt.
    expect(
      (await screen.findAllByRole('link', { name: 'PN000002' }))[0],
    ).toHaveAttribute('href', `/more/purchases/${receiptId}`);
    expect(screen.getByRole('link', { name: 'Trả nợ NCC' })).toHaveAttribute(
      'href',
      `/more/supplier-debts/${supplierId}/pay`,
    );
    const save = screen.getByRole('button', { name: 'Lưu nợ đầu kỳ' });
    await user.type(screen.getByLabelText('Số nợ'), '50000');
    expect(save).toBeDisabled();
    await user.type(screen.getByLabelText('Lý do'), 'Nợ sổ tay');
    await user.click(save);
    await waitFor(() =>
      expect(state.api.setOpening).toHaveBeenCalledWith({
        supplierId,
        amount: '50000',
        note: 'Nợ sổ tay',
        idempotencyKey: key,
      }),
    );
  });

  it('shows loading placeholders instead of zero', () => {
    state.api.debts.mockReturnValue(new Promise(() => {}));
    renderAt('/more/supplier-debts');
    expect(
      screen.getByRole('status', { name: 'Đang tải phải trả ncc' }),
    ).toBeVisible();
  });
});

describe('SupplierPayPage', () => {
  it('pays in cash and transfer, oldest receipt first', async () => {
    const user = userEvent.setup();
    state.api.pay.mockResolvedValue({
      supplierId,
      balance: '20000',
      version: 4,
    });
    renderAt(`/more/supplier-debts/${supplierId}/pay`);
    await user.type(await screen.findByLabelText('Tiền mặt'), '200000');
    await user.type(screen.getByLabelText('Chuyển khoản'), '30000');
    expect(screen.getByText('20.000 ₫')).toBeVisible();
    expect(screen.getByText('PN000004 · 15/10')).toBeVisible();
    await user.click(
      screen.getByRole('button', { name: 'Lưu và lập phiếu chi' }),
    );
    await waitFor(() =>
      expect(state.api.pay).toHaveBeenCalledWith({
        supplierId,
        expectedVersion: 3,
        cashAmount: '200000',
        bankTransferAmount: '30000',
        note: '',
        idempotencyKey: key,
      }),
    );
  });

  it('blocks paying more than is owed', async () => {
    const user = userEvent.setup();
    renderAt(`/more/supplier-debts/${supplierId}/pay`);
    await user.type(await screen.findByLabelText('Tiền mặt'), '250001');
    expect(screen.getByText('Vượt số đang nợ')).toBeVisible();
    expect(
      screen.getByRole('button', { name: 'Lưu và lập phiếu chi' }),
    ).toBeDisabled();
  });
});

describe('PurchaseReturnPage', () => {
  it('returns up to the stock at the receipt cost and needs a refund method for the rest', async () => {
    const user = userEvent.setup();
    state.api.returnOptions.mockResolvedValue({
      receiptId,
      receiptNumber: 'PN000002',
      status: 'POSTED',
      receivedAt: '2026-09-15T01:00:00Z',
      supplier: debt.supplier,
      outstandingAmount: '10000.00',
      lines: [
        {
          receiptLineId: '80000000-0000-4000-8000-000000000001',
          productId,
          productName: '12B Akopha Pháp',
          unitName: 'Hộp',
          receivedQty: '5',
          returnedQty: '0',
          onHandQty: '1',
          maxQty: '1',
          unitCost: '40000.00',
          lineCost: '200000.00',
          returnedAmount: '0',
        },
      ],
      returns: [],
    });
    state.api.postReturn.mockResolvedValue({
      returnId: '90000000-0000-4000-8000-000000000001',
      returnNumber: 'TN000001',
      totalAmount: '40000',
      debtApplied: '10000',
      refundAmount: '30000',
    });
    renderAt(`/more/purchases/${receiptId}/return`);
    const qty = await screen.findByLabelText('Số lượng trả');
    await user.type(qty, '2');
    expect(screen.getByText('Số trả vượt số được trả tối đa.')).toBeVisible();
    await user.clear(qty);
    await user.type(qty, '1');
    expect(screen.getByText('30.000 ₫')).toBeVisible();
    await user.type(screen.getByLabelText('Lý do'), 'Lỗi bao bì');
    const save = screen.getByRole('button', { name: 'Ghi sổ trả hàng' });
    expect(save).toBeDisabled();
    await user.click(screen.getByLabelText('Tiền mặt'));
    await user.click(save);
    await waitFor(() =>
      expect(state.api.postReturn).toHaveBeenCalledWith({
        receiptId,
        lines: [
          {
            receiptLineId: '80000000-0000-4000-8000-000000000001',
            quantity: '1',
          },
        ],
        reason: 'Lỗi bao bì',
        refundMethod: 'CASH',
        idempotencyKey: key,
      }),
    );
  });
});

describe('WriteOffPage', () => {
  it('writes off stock with a reason and never more than on hand', async () => {
    const user = userEvent.setup();
    state.api.writeOffProducts.mockResolvedValue([
      {
        productId,
        name: '12B vàng',
        sku: '12BV',
        unitName: 'Hộp',
        onHandQty: '100',
        avgUnitCost: '40000.00',
        avgUnitCostExact: '40000.000000',
        inventoryValue: '4000000.00',
      },
    ]);
    state.api.postWriteOff.mockResolvedValue({
      writeOffId: '90000000-0000-4000-8000-000000000002',
      writeOffNumber: 'XH000001',
      totalValue: '80000',
    });
    renderAt('/more/write-offs');
    await user.click(screen.getByRole('button', { name: 'Chọn 12B vàng' }));
    const qty = await screen.findByLabelText('Số lượng hủy');
    await user.type(qty, '101');
    expect(screen.getByText('Vượt tồn kho.')).toBeVisible();
    await user.clear(qty);
    await user.type(qty, '2');
    expect(screen.getByText('80.000 ₫')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Ghi sổ xuất hủy' }));
    await waitFor(() =>
      expect(state.api.postWriteOff).toHaveBeenCalledWith({
        lines: [{ productId, quantity: '2' }],
        reasonCode: 'EXPIRED',
        note: '',
        idempotencyKey: key,
      }),
    );
  });
});
