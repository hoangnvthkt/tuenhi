import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  executeFinancialCommand,
  FinancialOutcomeUnknownError,
  FinancialTransportError,
} from '@/shared/api/financial-command';
import { FINANCIAL_COMMAND_RECONCILE_EVENT } from '@/shared/api/financial-command-recovery';
import { ToastProvider } from '@/shared/ui/feedback/ToastProvider';
import type { Invoice } from '../api/sales-schemas';
import { SaleDetailPage } from './SaleDetailPage';

const userId = '10000000-0000-4000-8000-000000000001';
const saleId = '20000000-0000-4000-8000-000000000001';
const requestId = '30000000-0000-4000-8000-000000000001';

const invoice: Invoice = {
  version: 2,
  store: {
    displayName: 'Tuệ Nhi',
    logoPath: null,
    address: 'Hà Nội',
    contactPhone: null,
    zalo: null,
    invoiceFooter: 'Cảm ơn quý khách',
  },
  sale: {
    id: saleId,
    saleNumber: 'HD000001',
    completedAt: '2026-08-31T07:00:00.000Z',
    status: 'COMPLETED',
    channelCode: 'IN_STORE',
    channelName: 'Tại quầy',
    staffName: 'Chủ cửa hàng',
    customerName: 'Khách thử',
    customerPhone: null,
    paymentMethod: 'CASH',
    paymentStatus: 'CAPTURED',
    transferProofPath: null,
    cancelledAt: null,
    cancelReason: null,
  },
  lines: [
    {
      id: '50000000-0000-4000-8000-000000000001',
      productName: 'Áo thử',
      sku: 'AO-001',
      unitName: 'Cái',
      quantity: '1',
      unitSalePrice: '150000',
      grossAmount: '150000',
      lineDiscountAmount: '0',
      allocatedOrderDiscount: '0',
      netAmount: '150000',
      returnedQty: '0',
      returnableQty: '1',
    },
  ],
  totals: {
    subtotal: '150000',
    lineDiscountTotal: '0',
    orderDiscountTotal: '0',
    netTotal: '150000',
    capturedAmount: '150000',
  },
  lifecycle: { canReturn: true, canCancel: true, returns: [] },
};

const api = {
  invoice: vi.fn().mockResolvedValue(invoice),
};

vi.mock('../api/sales-api', () => ({ createSalesApi: () => api }));
vi.mock('@/shared/hooks/use-online-status', () => ({
  useOnlineStatus: () => true,
}));
vi.mock('@/features/auth', () => ({
  useSession: () => ({
    session: {
      userId,
      roleTemplate: 'BUSINESS',
      permissions: ['sale.own.read', 'return.request.create'],
    },
  }),
}));
vi.mock('@/shared/hooks/use-financial-command', () => ({
  useFinancialCommand: () => vi.fn(),
}));
vi.mock('@/shared/supabase/client', () => ({
  getSupabaseClient: () => ({
    storage: {
      from: () => ({ getPublicUrl: () => ({ data: { publicUrl: '' } }) }),
    },
  }),
}));
vi.mock('@/features/payments', () => ({ PaymentProofLink: () => null }));

function renderPage() {
  render(
    <MemoryRouter initialEntries={[`/sales/${saleId}`]}>
      <QueryClientProvider
        client={
          new QueryClient({ defaultOptions: { queries: { retry: false } } })
        }
      >
        <ToastProvider>
          <Routes>
            <Route path="/sales/:saleId" element={<SaleDetailPage />} />
          </Routes>
        </ToastProvider>
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  localStorage.clear();
  api.invoice.mockResolvedValue(invoice);
});

describe('SaleDetailPage productivity actions', () => {
  it('does not print automatically and exposes print, PDF and new-order actions', async () => {
    const user = userEvent.setup();
    const print = vi.spyOn(window, 'print').mockImplementation(() => undefined);
    renderPage();

    await screen.findByRole('heading', { name: 'HD000001' });
    expect(print).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'In nhiệt' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Tải PDF' })).toBeEnabled();
    expect(screen.getByRole('link', { name: 'Đơn mới' })).toHaveAttribute(
      'href',
      '/pos',
    );

    await user.click(screen.getByRole('button', { name: 'In nhiệt' }));
    expect(print).toHaveBeenCalledOnce();
    print.mockRestore();
  });

  it('shows payment reconciliation from the authoritative invoice response', async () => {
    renderPage();

    const reconciliation = await screen.findByRole('region', {
      name: 'Đối soát thanh toán',
    });
    expect(within(reconciliation).getByText('Đã ghi nhận')).toBeInTheDocument();
    expect(within(reconciliation).getByText(/150\.000/)).toBeInTheDocument();
    expect(
      within(reconciliation).getByText('Chủ cửa hàng'),
    ).toBeInTheDocument();
    expect(within(reconciliation).getByText('Tại quầy')).toBeInTheDocument();
  });

  it('shows a matching pending request and dispatches a read-only reconciliation', async () => {
    const user = userEvent.setup();
    await expect(
      executeFinancialCommand({
        userId,
        commandName: 'sale.complete',
        entityId: saleId,
        createId: () => requestId,
        invoke: async () => {
          throw new FinancialTransportError();
        },
        lookup: async () => ({ status: 'NOT_FOUND', response: null }),
        parseCachedResponse: (response) => response as never,
        isOnline: () => false,
        wait: async () => undefined,
      }),
    ).rejects.toBeInstanceOf(FinancialOutcomeUnknownError);
    const listener = vi.fn();
    window.addEventListener(FINANCIAL_COMMAND_RECONCILE_EVENT, listener);
    renderPage();

    expect(await screen.findByText(requestId)).toBeInTheDocument();
    await user.click(
      screen.getByRole('button', { name: 'Đối soát lại giao dịch' }),
    );

    expect(listener).toHaveBeenCalledOnce();
    window.removeEventListener(FINANCIAL_COMMAND_RECONCILE_EVENT, listener);
  });

  it('never invokes print from a reconciliation event', async () => {
    const print = vi.spyOn(window, 'print').mockImplementation(() => undefined);
    renderPage();
    await screen.findByRole('heading', { name: 'HD000001' });

    fireEvent(window, new Event(FINANCIAL_COMMAND_RECONCILE_EVENT));

    expect(print).not.toHaveBeenCalled();
    print.mockRestore();
  });
});
