import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '@/shared/ui/feedback/ToastProvider';
import { ReturnDetailPage } from './ReturnDetailPage';

const returnId = '10000000-0000-4000-8000-000000000001';
const saleId = '10000000-0000-4000-8000-000000000002';
const productId = '10000000-0000-4000-8000-000000000003';
const customerId = '10000000-0000-4000-8000-000000000004';
const lineId = '10000000-0000-4000-8000-000000000005';
const authState = vi.hoisted(() => ({ permissions: [] as string[] }));

const returnsApi = vi.hoisted(() => ({
  detail: vi.fn(),
  complete: vi.fn(),
  cancel: vi.fn(),
  parseCompleteResponse: vi.fn(),
}));
const financialMocks = vi.hoisted(() => ({
  run: vi.fn(),
  upload: vi.fn(),
  remove: vi.fn(),
}));
const salesApi = vi.hoisted(() => ({ detail: vi.fn() }));

vi.mock('../api/returns-api', () => ({ createReturnsApi: () => returnsApi }));
vi.mock('@/features/sales', () => ({ createSalesApi: () => salesApi }));
vi.mock('@/features/auth', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/features/auth')>()),
  useSession: () => ({
    session: {
      userId: '20000000-0000-4000-8000-000000000001',
      permissions: authState.permissions,
    },
  }),
}));
vi.mock('@/shared/hooks/use-online-status', () => ({
  useOnlineStatus: () => true,
}));
vi.mock('@/shared/hooks/use-financial-command', () => ({
  useFinancialCommand: () => financialMocks.run,
}));
vi.mock('@/features/payments', () => ({
  createPaymentProofApi: () => ({
    upload: financialMocks.upload,
    remove: financialMocks.remove,
  }),
  PaymentProofLink: () => null,
}));

const document = {
  id: returnId,
  returnNumber: 'TH000001',
  saleId,
  saleNumber: 'HD000001',
  status: 'COMPLETED',
  reason: 'Đổi hàng',
  refundTotal: '30000',
  version: 2,
  createdByName: 'Nhân viên A',
  createdAt: '2026-09-03T01:00:00Z',
  completedAt: '2026-09-03T02:00:00Z',
  cancelReason: null,
  canComplete: false,
  refundMethod: 'CASH' as const,
  transferProofPath: null,
  lines: [
    {
      id: lineId,
      originalSaleLineId: lineId,
      productId,
      productName: 'Sản phẩm A',
      sku: 'SP-01',
      unitName: 'Cái',
      requestedQty: '1',
      acceptedQty: '1',
      refundAmount: '30000',
      soldQty: '1',
      returnedQtyBefore: '0',
    },
  ],
};

function renderPage() {
  render(
    <MemoryRouter initialEntries={[`/returns/${returnId}`]}>
      <QueryClientProvider
        client={
          new QueryClient({ defaultOptions: { queries: { retry: false } } })
        }
      >
        <ToastProvider>
          <Routes>
            <Route path="/returns/:returnId" element={<ReturnDetailPage />} />
          </Routes>
        </ToastProvider>
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  financialMocks.run.mockImplementation(async ({ invoke }) =>
    invoke('30000000-0000-4000-8000-000000000001'),
  );
  authState.permissions = [];
  returnsApi.detail.mockResolvedValue(document);
  salesApi.detail.mockResolvedValue({ customerId, lines: [] });
});

describe('ReturnDetailPage relationship links', () => {
  it('links sale, customer and products according to permissions with one lookup', async () => {
    authState.permissions = ['sale.own.read', 'customer.read', 'catalog.read'];
    renderPage();

    expect(
      await screen.findByRole('link', { name: 'HD000001' }),
    ).toHaveAttribute('href', `/sales/${saleId}`);
    expect(
      await screen.findByRole('link', { name: 'Khách hàng' }),
    ).toHaveAttribute('href', `/more/customers/${customerId}`);
    expect(screen.getByRole('link', { name: 'Sản phẩm A' })).toHaveAttribute(
      'href',
      `/products/${productId}`,
    );
    expect(salesApi.detail).toHaveBeenCalledTimes(1);
  });

  it('keeps the return visible when the optional relationship lookup fails', async () => {
    authState.permissions = ['customer.read'];
    salesApi.detail.mockRejectedValueOnce(new Error('private raw error'));
    renderPage();

    expect(
      await screen.findByRole('heading', { name: /TH000001/ }),
    ).toBeInTheDocument();
    expect(screen.queryByText('private raw error')).not.toBeInTheDocument();
  });
});

describe('optional bank-transfer refund proofs', () => {
  it.each([false, true])(
    'completes a refund with an optional attachment: %s',
    async (attachProof) => {
      const user = userEvent.setup();
      vi.spyOn(window, 'confirm').mockReturnValue(true);
      returnsApi.detail.mockResolvedValue({
        ...document,
        status: 'REQUESTED',
        canComplete: true,
        completedAt: null,
      });
      financialMocks.upload.mockResolvedValue({
        objectPath: `returns/${returnId}/proof.jpg`,
      });
      renderPage();
      await user.selectOptions(
        await screen.findByLabelText('Phương thức hoàn tiền'),
        'BANK_TRANSFER',
      );
      if (attachProof) {
        await user.upload(
          screen.getByLabelText('Tải ảnh chứng từ hoàn tiền'),
          new File(['proof'], 'proof.jpg', { type: 'image/jpeg' }),
        );
      }
      const confirm = screen.getByRole('button', { name: 'Hoàn tất trả hàng' });
      expect(confirm).toBeEnabled();
      await user.click(confirm);
      expect(returnsApi.complete).toHaveBeenCalledExactlyOnceWith({
        returnId,
        expectedVersion: document.version,
        lines: [{ saleReturnLineId: lineId, acceptedQty: '1' }],
        refundMethod: 'BANK_TRANSFER',
        idempotencyKey: '30000000-0000-4000-8000-000000000001',
        transferProofPath: attachProof
          ? `returns/${returnId}/proof.jpg`
          : undefined,
      });
      expect(financialMocks.upload).toHaveBeenCalledTimes(attachProof ? 1 : 0);
    },
  );
});

it('distinguishes credit offset from cash refunded after a return', async () => {
  returnsApi.detail.mockResolvedValue({
    ...document,
    refundTotal: '30000',
    cashRefundAmount: '10000.50',
    debtOffsetAmount: '20000',
  });
  renderPage();
  expect(await screen.findByText(/Thực hoàn/)).toHaveTextContent('10.000,5');
  expect(screen.getByText(/Cấn trừ nợ/)).toHaveTextContent('20.000');
});
