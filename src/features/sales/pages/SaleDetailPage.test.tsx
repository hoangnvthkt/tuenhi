import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
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
import { invoiceFixture as invoice } from '../testing/invoice-fixture';
import { SaleDetailPage } from './SaleDetailPage';

const pdfMocks = vi.hoisted(() => ({
  download: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('pdfmake/build/pdfmake', () => ({
  default: {
    addFonts: vi.fn(),
    createPdf: () => ({ download: pdfMocks.download }),
  },
}));

const userId = '10000000-0000-4000-8000-000000000001';
const saleId = '20000000-0000-4000-8000-000000000001';
const requestId = '30000000-0000-4000-8000-000000000001';

const api = {
  invoice: vi.fn().mockResolvedValue(invoice),
  detail: vi.fn().mockResolvedValue({
    id: saleId,
    customerId: '60000000-0000-4000-8000-000000000001',
    lines: [
      {
        id: '50000000-0000-4000-8000-000000000001',
        productId: '70000000-0000-4000-8000-000000000001',
      },
    ],
  }),
};

const authState = vi.hoisted(() => ({
  permissions: ['sale.own.read', 'return.request.create'] as string[],
}));

vi.mock('../api/sales-api', () => ({ createSalesApi: () => api }));
vi.mock('@/shared/hooks/use-online-status', () => ({
  useOnlineStatus: () => true,
}));
vi.mock('@/features/auth', () => ({
  useSession: () => ({
    session: {
      userId,
      roleTemplate: 'BUSINESS',
      permissions: authState.permissions,
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
  api.detail.mockResolvedValue({
    id: saleId,
    customerId: '60000000-0000-4000-8000-000000000001',
    lines: [
      {
        id: '50000000-0000-4000-8000-000000000001',
        productId: '70000000-0000-4000-8000-000000000001',
      },
    ],
  });
  authState.permissions = ['sale.own.read', 'return.request.create'];
});

describe('SaleDetailPage productivity actions', () => {
  it('reports a rejected asynchronous PDF download and releases the busy button', async () => {
    const user = userEvent.setup();
    let rejectDownload!: (reason: Error) => void;
    pdfMocks.download.mockImplementationOnce(
      () =>
        new Promise<void>((_resolve, reject) => {
          rejectDownload = reject;
        }),
    );
    renderPage();
    await screen.findByRole('heading', { name: 'HD000001' });
    const download = screen.getByRole('button', { name: 'Tải PDF' });
    await user.click(download);
    await waitFor(() => expect(pdfMocks.download).toHaveBeenCalled());
    expect(download).toBeDisabled();
    await act(async () => {
      rejectDownload(new Error('download failed'));
    });
    expect(await screen.findByText('Không thể tạo PDF')).toBeVisible();
    expect(download).toBeEnabled();
  });

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

  it('links customer and products from one sale-detail lookup when permitted', async () => {
    authState.permissions = ['sale.own.read', 'customer.read', 'catalog.read'];
    renderPage();

    expect(
      await screen.findByRole('link', { name: 'Khách thử' }),
    ).toHaveAttribute(
      'href',
      '/more/customers/60000000-0000-4000-8000-000000000001',
    );
    expect(screen.getByRole('link', { name: 'Áo thử' })).toHaveAttribute(
      'href',
      '/products/70000000-0000-4000-8000-000000000001',
    );
    expect(api.detail).toHaveBeenCalledTimes(1);
  });

  it('keeps the invoice visible when the optional relationship lookup fails', async () => {
    authState.permissions = ['sale.own.read', 'customer.read', 'catalog.read'];
    api.detail.mockRejectedValueOnce(new Error('private raw error'));
    renderPage();

    expect(
      await screen.findByRole('heading', { name: 'HD000001' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Khách hàng: Khách thử')).toBeInTheDocument();
    expect(screen.queryByText('private raw error')).not.toBeInTheDocument();
  });
});
