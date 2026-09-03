import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { SessionContextValue } from '@/features/auth';
import type {
  CustomerDetail,
  CustomerExplorerApi,
} from '@/features/connected-explorer';
import { ToastProvider } from '@/shared/ui/feedback/ToastProvider';
import type { DirectoryApi } from '../api/directory-api';
import { CustomerDetailPage } from './CustomerDetailPage';

const customerId = '10000000-0000-4000-8000-000000000001';
const saleId = '10000000-0000-4000-8000-000000000002';
const returnId = '10000000-0000-4000-8000-000000000003';
const productId = '10000000-0000-4000-8000-000000000004';
const completedAt = '2026-09-03T02:00:00+00:00';

function detail(scope: CustomerDetail['salesScope'] = 'ALL'): CustomerDetail {
  return {
    id: customerId,
    code: 'KH-01',
    customerType: 'BUSINESS',
    name: 'Khách hàng A',
    phone: '+84912345678',
    email: 'khach@example.invalid',
    address: 'Hà Nội',
    companyName: 'Công ty A',
    taxCode: '0100000000',
    customerGroup: 'Thân thiết',
    notes: 'Gọi trước khi giao',
    isActive: true,
    version: 2,
    salesScope: scope,
    purchaseSummary:
      scope === 'NONE'
        ? null
        : {
            orderCount: 2,
            cancelledOrderCount: 1,
            completedReturnCount: 1,
            completedSalesNet: '200000.00',
            returnedTotal: '30000.00',
            cancelledTotal: '50000.00',
            netSpend: '120000.00',
            lastPurchaseAt: completedAt,
          },
  };
}

function explorerApi(
  scope: CustomerDetail['salesScope'] = 'ALL',
  overrides: Partial<CustomerExplorerApi> = {},
): CustomerExplorerApi {
  return {
    customerDetail: vi.fn().mockResolvedValue(detail(scope)),
    customerSales: vi.fn().mockResolvedValue({
      items: [
        {
          saleId,
          saleNumber: 'HD000001',
          completedAt,
          status: 'PARTIALLY_RETURNED',
          customerNameSnapshot: 'Khách hàng A',
          channelName: 'Tại quầy',
          createdByName: 'Nhân viên A',
          paymentMethod: 'CASH',
          paymentStatus: 'CAPTURED',
          originalNetTotal: '100000.00',
          returnedTotal: '30000.00',
          effectiveNetTotal: '70000.00',
        },
      ],
      nextCursor: null,
    }),
    customerReturns: vi.fn().mockResolvedValue({
      items: [
        {
          returnId,
          returnNumber: 'TH000001',
          completedAt: '2026-09-03T03:00:00+00:00',
          reason: 'Đổi hàng',
          refundTotal: '30000.00',
          refundMethod: 'CASH',
          saleId,
          saleNumber: 'HD000001',
          lines: [
            {
              lineId: '10000000-0000-4000-8000-000000000005',
              productId,
              sku: 'SP-01',
              productName: 'Sản phẩm A',
              unitName: 'Cái',
              acceptedQty: '1',
              refundAmount: '30000.00',
            },
          ],
        },
      ],
      nextCursor: null,
    }),
    customerProducts: vi.fn().mockResolvedValue({
      items: [
        {
          productId,
          sku: 'SP-01',
          productName: 'Sản phẩm A',
          unitName: 'Cái',
          productIsActive: true,
          orderCount: 2,
          grossSoldQty: '3',
          returnedQty: '1',
          netPurchasedQty: '2',
          grossNetAmount: '90000.00',
          refundedAmount: '30000.00',
          netPurchasedAmount: '60000.00',
          lastPurchasedAt: completedAt,
        },
      ],
      nextCursor: null,
    }),
    ...overrides,
  };
}

function directoryApi(): DirectoryApi {
  return {
    listSuppliers: vi.fn(),
    listCustomers: vi.fn(),
    saveSupplier: vi.fn(),
    saveCustomer: vi.fn().mockResolvedValue({ customerId, version: 3 }),
  };
}

function renderPage({
  api,
  permissions,
  entry = `/more/customers/${customerId}`,
  mode = 'view',
}: {
  api: CustomerExplorerApi;
  permissions: string[];
  entry?: string;
  mode?: 'view' | 'edit';
}) {
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <SessionContextValue.Provider
        value={{
          status: 'authenticated',
          session: {
            userId: '20000000-0000-4000-8000-000000000001',
            email: 'owner@example.invalid',
            displayName: 'Chủ cửa hàng',
            roleTemplate: 'OWNER',
            isActive: true,
            mustChangePassword: false,
            permissions,
          },
          errorMessage: null,
          refresh: vi.fn(),
          signIn: vi.fn(),
          changePassword: vi.fn(),
          signOut: vi.fn(),
        }}
      >
        <ToastProvider>
          <MemoryRouter initialEntries={[entry]}>
            <Routes>
              <Route
                path={
                  mode === 'edit'
                    ? '/more/customers/:customerId/edit'
                    : '/more/customers/:customerId'
                }
                element={
                  <CustomerDetailPage
                    api={api}
                    directoryApi={directoryApi()}
                    mode={mode}
                  />
                }
              />
              <Route path="/sales/:saleId" element={<p>Sale route</p>} />
              <Route path="/returns/:returnId" element={<p>Return route</p>} />
              <Route
                path="/products/:productId"
                element={<p>Product route</p>}
              />
            </Routes>
          </MemoryRouter>
        </ToastProvider>
      </SessionContextValue.Provider>
    </QueryClientProvider>,
  );
}

describe('CustomerDetailPage', () => {
  it('loads master data without transaction list calls for NONE scope', async () => {
    const api = explorerApi('NONE');
    renderPage({ api, permissions: ['customer.read'] });

    expect(await screen.findByText('Khách hàng A')).toBeInTheDocument();
    expect(screen.getByText('khach@example.invalid')).toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: 'Hóa đơn' }),
    ).not.toBeInTheDocument();
    expect(api.customerSales).not.toHaveBeenCalled();
    expect(api.customerReturns).not.toHaveBeenCalled();
    expect(api.customerProducts).not.toHaveBeenCalled();
  });

  it('labels OWN scope and renders permission-gated actions', async () => {
    const api = explorerApi('OWN');
    renderPage({
      api,
      permissions: [
        'customer.manage',
        'sale.own.read',
        'sale.draft.manage',
        'return.request.create',
      ],
    });

    expect(await screen.findByText('Giao dịch của tôi')).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Bán cho khách này' }),
    ).toHaveAttribute('href', `/pos?customerId=${customerId}`);
    expect(
      screen.getByRole('link', { name: 'Sửa khách hàng' }),
    ).toHaveAttribute('href', `/more/customers/${customerId}/edit`);
  });

  it('keeps profile and KPI visible when recent returns fail', async () => {
    const api = explorerApi('ALL', {
      customerReturns: vi
        .fn()
        .mockRejectedValue(new Error('private raw error')),
    });
    renderPage({
      api,
      permissions: ['customer.read', 'sale.all.read', 'catalog.read'],
    });

    expect(await screen.findByText('Khách hàng A')).toBeInTheDocument();
    expect(screen.getByText('120.000 ₫')).toBeInTheDocument();
    expect(
      await screen.findByText('Không thể tải phần dữ liệu này.'),
    ).toBeInTheDocument();
    expect(screen.queryByText('private raw error')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Từ ngày')).toBeInTheDocument();
    expect(screen.getByLabelText('Đến ngày')).toBeInTheDocument();
  });

  it('links recent sales and returns from the merged overview activity', async () => {
    const api = explorerApi();
    renderPage({
      api,
      permissions: ['customer.read', 'sale.all.read', 'return.request.create'],
    });

    expect(
      await screen.findByRole('link', { name: 'HD000001' }),
    ).toHaveAttribute('href', `/sales/${saleId}`);
    expect(screen.getByRole('link', { name: 'TH000001' })).toHaveAttribute(
      'href',
      `/returns/${returnId}`,
    );
  });

  it('links products, sales and returns when permissions allow', async () => {
    const api = explorerApi();
    renderPage({
      api,
      entry: `/more/customers/${customerId}?tab=products`,
      permissions: [
        'customer.read',
        'sale.all.read',
        'catalog.read',
        'return.request.create',
      ],
    });

    expect(
      await screen.findByRole('link', { name: 'Sản phẩm A' }),
    ).toHaveAttribute('href', `/products/${productId}`);
    expect(
      screen.queryByText(/giá vốn|lợi nhuận|cogs/i),
    ).not.toBeInTheDocument();
  });

  it('uses the current version when editing the customer', async () => {
    const user = userEvent.setup();
    const api = explorerApi();
    renderPage({
      api,
      entry: `/more/customers/${customerId}/edit`,
      permissions: ['customer.manage'],
      mode: 'edit',
    });

    await screen.findByRole('heading', { name: 'Sửa khách hàng' });
    expect(screen.getByLabelText('Tên khách hàng')).toHaveValue('Khách hàng A');
    await user.click(screen.getByRole('button', { name: 'Lưu khách hàng' }));
    expect(await screen.findByText('Đã lưu khách hàng')).toBeInTheDocument();
  });
});
