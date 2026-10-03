import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '@/shared/ui/feedback/ToastProvider';
import { PosPage } from './PosPage';
import { draftPrintFixture } from '../testing/draft-print-fixture';
import type { Sale } from '../api/sales-schemas';

const mocks = vi.hoisted(() => ({
  saveDraft: vi.fn(),
  draftPrint: vi.fn(),
  detail: vi.fn(),
  complete: vi.fn(),
  customerDetail: vi.fn(),
  listCustomers: vi.fn(),
}));
vi.mock('../api/sales-api', () => ({ createSalesApi: () => mocks }));
vi.mock('@/features/auth', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/features/auth')>()),
  useSession: () => ({
    session: {
      userId: '10000000-0000-4000-8000-000000000001',
      permissions: ['sale.discount.apply'],
    },
  }),
}));
vi.mock('@/shared/hooks/use-online-status', () => ({
  useOnlineStatus: () => true,
}));
vi.mock('@/features/catalog', () => ({
  createCatalogApi: () => ({ list: async () => ({ items: [] }) }),
}));
vi.mock('@/features/directories', () => ({
  createDirectoryApi: () => ({ listCustomers: mocks.listCustomers }),
}));
vi.mock('@/features/connected-explorer', () => ({
  createCustomerExplorerApi: () => ({ customerDetail: mocks.customerDetail }),
}));
vi.mock('@/features/settings', () => ({
  createSettingsApi: () => ({
    listSalesChannels: async () => [
      {
        id: '40000000-0000-4000-8000-000000000001',
        code: 'IN_STORE',
        name: 'Tại quầy',
        isActive: true,
        version: 1,
        sortOrder: 1,
      },
    ],
  }),
}));
vi.mock('@/features/payments', () => ({ createPaymentProofApi: () => ({}) }));
vi.mock('@/shared/hooks/use-financial-command', () => ({
  useFinancialCommand: () => vi.fn(),
}));

const saved: Sale = {
  id: draftPrintFixture.draft.id,
  saleNumber: null,
  status: 'DRAFT',
  customerId: null,
  salesChannelId: '40000000-0000-4000-8000-000000000001',
  subtotal: '100000',
  lineDiscountTotal: '3000',
  orderDiscountTotal: '0',
  discountTotal: '3000',
  netTotal: '97000',
  note: null,
  createdBy: '10000000-0000-4000-8000-000000000001',
  version: 3,
  createdAt: '2026-10-02T08:00:00Z',
  updatedAt: '2026-10-02T08:00:00Z',
  lines: [
    {
      ...draftPrintFixture.lines[0]!,
      productId: '50000000-0000-4000-8000-000000000001',
      lineOrder: 0,
    },
  ],
};

function renderPos(entry = '/pos') {
  render(
    <MemoryRouter initialEntries={[entry]}>
      <QueryClientProvider
        client={
          new QueryClient({ defaultOptions: { queries: { retry: false } } })
        }
      >
        <ToastProvider>
          <Routes>
            <Route path="/pos" element={<PosPage />} />
            <Route path="/pos/:saleId" element={<PosPage />} />
          </Routes>
        </ToastProvider>
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  sessionStorage.clear();
  mocks.customerDetail.mockReset();
  mocks.listCustomers.mockResolvedValue({ items: [] });
  mocks.saveDraft.mockResolvedValue({ sale: saved, priceRefreshed: false });
  mocks.detail.mockResolvedValue(saved);
  mocks.draftPrint.mockResolvedValue(draftPrintFixture);
  localStorage.setItem(
    'tuenhi:pos:cart:10000000-0000-4000-8000-000000000001',
    JSON.stringify({
      items: [{ ...saved.lines[0]!, onHandQty: '0' }],
      channelId: saved.salesChannelId,
      customerId: '',
      orderDiscount: '0',
      note: '',
    }),
  );
});

const targetCustomer = {
  id: '60000000-0000-4000-8000-000000000001',
  code: 'KH001',
  customerType: 'INDIVIDUAL',
  name: 'Khách từ liên kết',
  phone: null,
  email: null,
  address: null,
  companyName: null,
  taxCode: null,
  customerGroup: null,
  notes: null,
  isActive: true,
  version: 1,
  salesScope: 'NONE',
  purchaseSummary: null,
};

describe('POS provisional printing', () => {
  it('keeps the chosen customer fixed while provisional draft saving is pending', async () => {
    const currentCustomer = {
      ...targetCustomer,
      id: '60000000-0000-4000-8000-000000000002',
      name: 'Khách hiện tại',
    };
    mocks.listCustomers.mockResolvedValue({ items: [currentCustomer] });
    mocks.customerDetail.mockResolvedValue(targetCustomer);
    const cartKey = 'tuenhi:pos:cart:10000000-0000-4000-8000-000000000001';
    localStorage.setItem(
      cartKey,
      JSON.stringify({
        ...JSON.parse(localStorage.getItem(cartKey)!),
        customerId: currentCustomer.id,
      }),
    );
    mocks.saveDraft.mockReturnValueOnce(new Promise(() => {}));
    renderPos(`/pos?customerId=${targetCustomer.id}`);
    const replace = await screen.findByRole('button', {
      name: 'Đổi khách hàng',
    });
    await userEvent.click(screen.getByRole('button', { name: 'In tạm tính' }));
    await userEvent.click(replace);
    expect(screen.getByLabelText('Khách hàng')).toHaveValue(currentCustomer.id);
    expect(replace).toBeDisabled();
    expect(mocks.saveDraft).toHaveBeenCalledWith(
      expect.objectContaining({ customerId: currentCustomer.id }),
    );
  });

  it('defers a late customer prefill while provisional draft saving is pending', async () => {
    let resolveCustomer!: (customer: typeof targetCustomer) => void;
    mocks.customerDetail.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveCustomer = resolve;
      }),
    );
    let resolveSave!: (value: { sale: Sale; priceRefreshed: boolean }) => void;
    mocks.saveDraft.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveSave = resolve;
      }),
    );
    renderPos(`/pos?customerId=${targetCustomer.id}`);
    const customer = await screen.findByLabelText('Khách hàng');
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'In tạm tính' })).toBeEnabled(),
    );
    await userEvent.click(screen.getByRole('button', { name: 'In tạm tính' }));
    await act(async () => {
      resolveCustomer(targetCustomer);
    });
    expect(customer).toHaveValue('');
    expect(
      screen.getByRole('button', { name: 'Chọn khách hàng này' }),
    ).toBeDisabled();
    expect(mocks.saveDraft).toHaveBeenCalledWith(
      expect.objectContaining({ customerId: undefined }),
    );
    await act(async () => {
      resolveSave({ sale: saved, priceRefreshed: false });
    });
    expect(
      await screen.findByRole('dialog', { name: 'Xem phiếu tạm tính' }),
    ).toBeVisible();
    expect(customer).toHaveValue('');
  });

  it('saves a new zero-stock cart, survives the draft route change and previews server totals', async () => {
    renderPos();
    await userEvent.click(
      await screen.findByRole('button', { name: 'In tạm tính' }),
    );
    expect(
      await screen.findByRole('dialog', { name: 'Xem phiếu tạm tính' }),
    ).toBeVisible();
    expect(screen.getByText('PHIẾU TẠM TÍNH — CHƯA THANH TOÁN')).toBeVisible();
    expect(mocks.saveDraft).toHaveBeenCalledOnce();
    expect(mocks.draftPrint).toHaveBeenCalledWith(saved.id);
    expect(mocks.complete).not.toHaveBeenCalled();
    await userEvent.keyboard('{Control>}{Enter}{/Control}');
    expect(
      screen.queryByRole('dialog', { name: 'Xác nhận thanh toán' }),
    ).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Đóng' }));
    expect(
      await screen.findByRole('button', { name: 'Bỏ nháp' }),
    ).toBeEnabled();
  });

  it('keeps the saved draft editable if its scoped print lookup is denied', async () => {
    mocks.draftPrint.mockRejectedValueOnce(
      new Error('Bạn không có quyền thực hiện thao tác này.'),
    );
    renderPos();
    await userEvent.click(
      await screen.findByRole('button', { name: 'In tạm tính' }),
    );
    expect(
      await screen.findByText('Không thể mở phiếu tạm tính'),
    ).toBeVisible();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'In tạm tính' })).toBeEnabled(),
    );
    expect(mocks.complete).not.toHaveBeenCalled();
  });

  it('does not read or print a stale document when saving fails', async () => {
    mocks.saveDraft.mockRejectedValueOnce(new Error('Không thể lưu dữ liệu.'));
    renderPos();
    await userEvent.click(
      await screen.findByRole('button', { name: 'In tạm tính' }),
    );
    await waitFor(() =>
      expect(screen.getByText('Không thể lưu tạm')).toBeVisible(),
    );
    expect(mocks.draftPrint).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(mocks.complete).not.toHaveBeenCalled();
  });
});
