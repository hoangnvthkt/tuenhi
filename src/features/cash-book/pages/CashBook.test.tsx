import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '@/shared/ui/feedback/ToastProvider';
import { CashBookPage } from './CashBookPage';
import { CashShiftPage } from './CashShiftPage';
import { CashVoucherPage } from './CashVoucherPage';
import { formatCashTime, subtractMoney } from '../model/cash-labels';

const userId = '10000000-0000-4000-8000-000000000001';
const key = '50000000-0000-4000-8000-000000000001';
const state = vi.hoisted(() => ({
  permissions: [] as string[],
  run: vi.fn(),
  api: {
    book: vi.fn(),
    shifts: vi.fn(),
    myShift: vi.fn(),
    createVoucher: vi.fn(),
    cancelVoucher: vi.fn(),
    setOpening: vi.fn(),
    openShift: vi.fn(),
    closeShift: vi.fn(),
    parseVoucher: vi.fn(),
    parseCancel: vi.fn(),
    parseOpening: vi.fn(),
    parseShift: vi.fn(),
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
vi.mock('@/shared/hooks/use-online-status', () => ({
  useOnlineStatus: () => true,
}));
vi.mock('@/shared/hooks/use-financial-command', () => ({
  useFinancialCommand: () => state.run,
}));
vi.mock('../api/cash-book-api', async (original) => ({
  ...(await original<typeof import('../api/cash-book-api')>()),
  createCashBookApi: () => state.api,
}));

const shift = {
  id: '60000000-0000-4000-8000-000000000001',
  shiftNumber: 'CA000001',
  userId,
  userName: 'Thu ngân',
  status: 'OPEN' as const,
  openedAt: '2026-10-16T01:00:00Z',
  closedAt: null,
  openingCash: '500000.00',
  cashIn: '25000.00',
  cashOut: '55000.00',
  cashInCount: 1,
  cashOutCount: 1,
  bankIn: '579000.00',
  bankOut: '549000.00',
  expectedCash: '470000.00',
  countedCash: null,
  difference: null,
  closeNote: null,
  version: 1,
};
const book = {
  version: 1,
  fund: 'CASH',
  scope: 'ALL',
  opening: null,
  fundBalances: { CASH: '144000.00', BANK: '30000.00' },
  openings: { CASH: false, BANK: false },
  shift: null,
  summary: {
    totalIn: '199000.00',
    totalOut: '55000.00',
    inCount: 2,
    outCount: 1,
    openingBalance: '0.00',
    closingBalance: '144000.00',
  },
  items: [
    {
      entryKey: 'r:1',
      occurredAt: '2026-10-16T02:36:00Z',
      direction: 'OUT',
      source: 'RETURN_REFUND',
      category: null,
      amount: '55000.00',
      documentType: 'RETURN',
      documentId: '70000000-0000-4000-8000-000000000001',
      documentNumber: 'TH000001',
      party: 'Khách lẻ',
      memo: null,
      actorName: 'Admin',
      balanceAfter: '144000.00',
      canCancel: false,
    },
    {
      entryKey: 'v:2',
      occurredAt: '2026-10-16T02:00:00Z',
      direction: 'OUT',
      source: 'VOUCHER',
      category: 'EXPENSE',
      amount: '15000.00',
      documentType: 'VOUCHER',
      documentId: '80000000-0000-4000-8000-000000000001',
      documentNumber: 'PC000001',
      party: 'Điện lực',
      memo: 'Tiền điện',
      actorName: 'Admin',
      balanceAfter: '199000.00',
      canCancel: true,
    },
  ],
  nextCursor: null,
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
            <Route path="/cash-book" element={<CashBookPage />} />
            <Route path="/cash-book/shift" element={<CashShiftPage />} />
            <Route
              path="/cash-book/vouchers/new"
              element={<CashVoucherPage />}
            />
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
    'cash.book.read',
    'cash.voucher.create',
    'cash.shift.manage',
    'cash.opening.set',
  ];
  state.run.mockImplementation(async ({ invoke }) => invoke(key));
  state.api.book.mockResolvedValue(book);
  state.api.shifts.mockResolvedValue({ items: [], nextCursor: null });
  state.api.myShift.mockResolvedValue(shift);
});

describe('subtractMoney', () => {
  it('is exact for counted minus expected cash', () => {
    expect(subtractMoney('469000', '470000.00')).toBe('-1000');
    expect(subtractMoney('0.1', '0.3')).toBe('-0.20');
    expect(subtractMoney('470000', '470000.00')).toBe('0');
  });
  it('shows day/month hour:minute in Vietnam time', () => {
    expect(formatCashTime('2026-10-16T02:36:00Z')).toBe('16/10 09:36');
  });
});

describe('CashBookPage', () => {
  it('shows both fund balances, period totals and links each entry to its document', async () => {
    renderAt('/cash-book?fund=CASH&period=month&from=2026-10-01&to=2026-10-31');
    expect((await screen.findAllByText('TH000001'))[0]).toBeVisible();
    expect(screen.getByRole('button', { name: /Tiền mặt/ })).toHaveTextContent(
      '144.000 ₫',
    );
    expect(screen.getByRole('button', { name: /Ngân hàng/ })).toHaveTextContent(
      '30.000 ₫',
    );
    expect(screen.getByText('+199.000 ₫')).toBeVisible();
    expect(screen.getAllByText('−55.000 ₫')).toHaveLength(2);
    // Desktop cell and the phone line under the label both link the document.
    expect(
      screen.getAllByRole('link', { name: 'TH000001' })[0],
    ).toHaveAttribute('href', '/returns/70000000-0000-4000-8000-000000000001');
    expect(state.api.book).toHaveBeenCalledWith({
      fund: 'CASH',
      from: '2026-10-01',
      to: '2026-10-31',
      scope: 'ALL',
      shiftId: null,
      cursor: undefined,
    });
    expect(
      screen.getByRole('form', { name: 'Số dư đầu quỹ Tiền mặt' }),
    ).toBeVisible();
  });

  it('cancels a manual voucher only with a reason', async () => {
    const user = userEvent.setup();
    state.api.cancelVoucher.mockResolvedValue({
      voucherId: book.items[1]!.documentId,
      reversals: [],
    });
    renderAt('/cash-book?fund=CASH');
    await user.click(await screen.findByRole('button', { name: 'Hủy phiếu' }));
    const confirm = screen.getByRole('button', { name: 'Xác nhận hủy' });
    expect(confirm).toBeDisabled();
    await user.type(screen.getByLabelText('Lý do hủy'), 'Nhập nhầm');
    await user.click(confirm);
    await waitFor(() =>
      expect(state.api.cancelVoucher).toHaveBeenCalledWith({
        voucherId: '80000000-0000-4000-8000-000000000001',
        reason: 'Nhập nhầm',
        idempotencyKey: key,
      }),
    );
    expect(state.run).toHaveBeenCalledWith(
      expect.objectContaining({ commandName: 'cash.voucher.cancel' }),
    );
  });

  it('hides balances and other people for a cashier', async () => {
    state.permissions = ['cash.shift.manage'];
    state.api.book.mockResolvedValue({
      ...book,
      scope: 'OWN',
      fundBalances: null,
      openings: null,
    });
    renderAt('/cash-book');
    await screen.findAllByText('TH000001');
    expect(screen.queryByText('Tồn cuối kỳ')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: 'Lập phiếu chi' }),
    ).not.toBeInTheDocument();
    expect(state.api.book).toHaveBeenCalledWith(
      expect.objectContaining({ scope: 'OWN' }),
    );
  });

  it('shows loading instead of zero', () => {
    state.api.book.mockReturnValue(new Promise(() => {}));
    renderAt('/cash-book');
    expect(
      screen.getByRole('status', { name: 'Đang tải tổng thu' }),
    ).toBeVisible();
  });
});

describe('CashShiftPage', () => {
  it('closes a shift with the counted cash and requires a note when it is short', async () => {
    const user = userEvent.setup();
    state.api.closeShift.mockResolvedValue({ ...shift, status: 'CLOSED' });
    renderAt('/cash-book/shift');
    expect(await screen.findByText('470.000 ₫')).toBeVisible();
    expect(
      screen.getByRole('link', { name: /Thu tiền mặt · 1 phiếu/ }),
    ).toHaveAttribute('href', `/cash-book?fund=CASH&shift=${shift.id}`);
    await user.type(screen.getByLabelText('Tiền mặt đếm được'), '469000');
    expect(screen.getByText('-1.000 ₫')).toBeVisible();
    const close = screen.getByRole('button', { name: 'Đóng ca' });
    expect(close).toBeDisabled();
    await user.type(screen.getByLabelText(/Ghi chú/), 'Thối nhầm');
    await user.click(close);
    await waitFor(() =>
      expect(state.api.closeShift).toHaveBeenCalledWith({
        shiftId: shift.id,
        expectedVersion: 1,
        countedCash: '469000',
        note: 'Thối nhầm',
        idempotencyKey: key,
      }),
    );
  });

  it('opens a shift with the starting cash', async () => {
    const user = userEvent.setup();
    state.api.myShift.mockResolvedValue(null);
    state.api.openShift.mockResolvedValue(shift);
    renderAt('/cash-book/shift');
    await user.type(await screen.findByLabelText('Tiền mặt đầu ca'), '500000');
    await user.click(screen.getByRole('button', { name: 'Mở ca' }));
    await waitFor(() =>
      expect(state.api.openShift).toHaveBeenCalledWith({
        openingCash: '500000',
        idempotencyKey: key,
      }),
    );
    expect(state.run).toHaveBeenCalledWith(
      expect.objectContaining({
        commandName: 'cash.shift.open',
        entityId: userId,
      }),
    );
  });
});

describe('CashVoucherPage', () => {
  it('saves a bank deposit as a fund transfer and returns to the book', async () => {
    const user = userEvent.setup();
    state.api.createVoucher.mockResolvedValue({
      voucherId: '80000000-0000-4000-8000-000000000002',
      voucherNumber: 'PC000002',
      transferVoucherId: '80000000-0000-4000-8000-000000000003',
      transferVoucherNumber: 'PT000001',
    });
    renderAt('/cash-book/vouchers/new?direction=OUT&fund=CASH');
    await user.selectOptions(
      screen.getByLabelText('Loại chi'),
      'FUND_TRANSFER',
    );
    await user.type(screen.getByLabelText('Số tiền'), '100000');
    const save = screen.getByRole('button', { name: 'Lưu phiếu chi' });
    expect(save).toBeDisabled();
    await user.type(screen.getByLabelText('Nội dung'), 'Nộp tiền');
    await user.click(save);
    await waitFor(() =>
      expect(state.api.createVoucher).toHaveBeenCalledWith({
        fund: 'CASH',
        direction: 'OUT',
        category: 'FUND_TRANSFER',
        amount: '100000',
        party: '',
        memo: 'Nộp tiền',
        idempotencyKey: key,
      }),
    );
    await waitFor(() =>
      expect(screen.getByLabelText('Địa chỉ')).toHaveTextContent(
        '/cash-book?fund=CASH',
      ),
    );
  });
});
