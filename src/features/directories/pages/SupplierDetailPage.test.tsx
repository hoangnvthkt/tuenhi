import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { SessionContextValue } from '@/features/auth';
import type { ConnectedExplorerApi } from '@/features/connected-explorer';
import { ToastProvider } from '@/shared/ui/feedback/ToastProvider';
import type { DirectoryApi } from '../api/directory-api';
import { SupplierDetailPage } from './SupplierDetailPage';

const supplierId = '10000000-0000-4000-8000-000000000001';
const productId = '10000000-0000-4000-8000-000000000002';
const receiptId = '10000000-0000-4000-8000-000000000003';

function explorerApi(canReadPurchases = true): ConnectedExplorerApi {
  return {
    productContext: vi.fn(),
    productSuppliers: vi.fn(),
    supplierDetail: vi.fn().mockResolvedValue({
      id: supplierId,
      code: 'NCC-01',
      name: 'Nhà cung cấp A',
      phone: '+84912345678',
      email: 'ncc@example.invalid',
      address: 'Hà Nội',
      notes: 'Giao buổi sáng',
      isActive: true,
      version: 2,
      canReadPurchases,
      canReadCost: false,
      distinctProductCount: canReadPurchases ? 1 : null,
      postedReceiptCount: canReadPurchases ? 2 : null,
      totalReceivedQty: canReadPurchases ? '5' : null,
      lastReceivedAt: canReadPurchases ? '2026-08-31T10:00:00.000Z' : null,
      totalPostedCost: null,
    }),
    supplierProducts: vi.fn().mockResolvedValue({
      items: [
        {
          productId,
          sku: 'SP-01',
          productName: 'Sản phẩm A',
          unitName: 'Hộp',
          isActive: true,
          postedReceiptCount: 2,
          totalReceivedQty: '5',
          lastReceivedAt: '2026-08-31T10:00:00.000Z',
          latestReceiptId: receiptId,
          latestReceiptNumber: 'PN000001',
          latestUnitCost: null,
          canReadCost: false,
        },
      ],
      nextCursor: null,
    }),
    postedPurchaseHistory: vi.fn().mockResolvedValue({
      items: [],
      nextCursor: null,
    }),
  };
}

function directoryApi(): DirectoryApi {
  return {
    listSuppliers: vi.fn(),
    listCustomers: vi.fn(),
    saveSupplier: vi.fn().mockResolvedValue({ supplierId, version: 3 }),
    saveCustomer: vi.fn(),
  };
}

function renderPage({
  api,
  permissions,
  entry = `/more/suppliers/${supplierId}`,
}: {
  api: ConnectedExplorerApi;
  permissions: string[];
  entry?: string;
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
            userId: supplierId,
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
                path="/more/suppliers/:supplierId"
                element={
                  <SupplierDetailPage api={api} directoryApi={directoryApi()} />
                }
              />
            </Routes>
          </MemoryRouter>
        </ToastProvider>
      </SessionContextValue.Provider>
    </QueryClientProvider>,
  );
}

describe('SupplierDetailPage', () => {
  it('shows master data without calling purchase lists when permission is absent', async () => {
    const api = explorerApi(false);
    renderPage({ api, permissions: ['supplier.read'] });
    expect(await screen.findByText('Nhà cung cấp A')).toBeInTheDocument();
    expect(screen.getByText('ncc@example.invalid')).toBeInTheDocument();
    expect(api.supplierProducts).not.toHaveBeenCalled();
    expect(api.postedPurchaseHistory).not.toHaveBeenCalled();
    expect(
      screen.queryByRole('link', { name: 'Lập phiếu nhập' }),
    ).not.toBeInTheDocument();
  });

  it('links products and receipts but does not render hidden costs', async () => {
    const api = explorerApi(true);
    renderPage({
      api,
      permissions: [
        'supplier.read',
        'catalog.read',
        'purchase.operational.read',
        'purchase.draft.manage',
      ],
      entry: `/more/suppliers/${supplierId}?tab=products`,
    });
    expect(
      await screen.findByRole('link', { name: 'Sản phẩm A' }),
    ).toHaveAttribute('href', `/products/${productId}`);
    expect(screen.getByRole('link', { name: 'PN000001' })).toHaveAttribute(
      'href',
      `/more/purchases/${receiptId}`,
    );
    expect(
      screen.getByRole('link', { name: 'Lập phiếu nhập' }),
    ).toHaveAttribute('href', `/more/purchases/new?supplierId=${supplierId}`);
    expect(screen.queryByText(/đơn giá gần nhất/i)).not.toBeInTheDocument();
  });
});
