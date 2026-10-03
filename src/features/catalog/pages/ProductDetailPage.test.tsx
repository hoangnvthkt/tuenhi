import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  createMemoryRouter,
  createRoutesFromElements,
  RouterProvider,
  Route,
} from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '@/shared/ui/feedback/ToastProvider';
import { SessionContextValue } from '@/features/auth';
import type { CatalogApi } from '../api/catalog-api';
import type { ConnectedExplorerApi } from '@/features/connected-explorer';
import type { ProductDetail } from '../model/catalog-types';
import { ProductDetailPage } from './ProductDetailPage';

const detail: ProductDetail = {
  id: '10000000-0000-4000-8000-000000000010',
  sku: 'SP-001',
  barcode: '0123456789012',
  name: 'Sản phẩm A',
  categoryId: null,
  categoryName: null,
  unitName: 'Hộp',
  description: 'Mô tả sản phẩm',
  minStockQty: '10',
  isActive: true,
  version: 3,
  primaryImagePath: null,
  currentSalePrice: '25000.00',
  salePriceValidFrom: '2026-08-22T06:00:00.000Z',
  onHandQty: '4',
  images: [],
};

function createApi(overrides: Partial<CatalogApi> = {}): CatalogApi {
  return {
    list: vi.fn(),
    detail: vi.fn().mockResolvedValue(detail),
    listCategories: vi.fn().mockResolvedValue([]),
    priceHistory: vi.fn().mockResolvedValue([]),
    saveProduct: vi.fn().mockResolvedValue({
      productId: detail.id,
      version: 1,
    }),
    setSalePrice: vi.fn().mockResolvedValue(undefined),
    saveCategory: vi.fn(),
    ...overrides,
  };
}

function renderPage({
  api,
  explorerApi = {
    productContext: vi.fn(),
    productSuppliers: vi.fn(),
    supplierDetail: vi.fn(),
    supplierProducts: vi.fn(),
    postedPurchaseHistory: vi.fn(),
  } as unknown as ConnectedExplorerApi,
  mode = 'view',
  permissions = ['catalog.read'],
  initialEntry,
}: {
  api: CatalogApi;
  explorerApi?: ConnectedExplorerApi;
  mode?: 'view' | 'create' | 'edit';
  permissions?: string[];
  initialEntry?: string;
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
            userId: '10000000-0000-4000-8000-000000000009',
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
          <RouterProvider
            router={createMemoryRouter(
              createRoutesFromElements(
                <>
                  <Route
                    path={
                      mode === 'create'
                        ? '/products/new'
                        : mode === 'edit'
                          ? '/products/:productId/edit'
                          : '/products/:productId'
                    }
                    element={
                      <ProductDetailPage
                        api={api}
                        explorerApi={explorerApi}
                        mode={mode}
                      />
                    }
                  />
                  <Route
                    path="/products/:productId"
                    element={<p>Đã lưu sản phẩm</p>}
                  />
                </>,
              ),
              {
                initialEntries: [
                  initialEntry ??
                    (mode === 'create'
                      ? '/products/new'
                      : `/products/${detail.id}${mode === 'edit' ? '/edit' : ''}`),
                ],
              },
            )}
          />
        </ToastProvider>
      </SessionContextValue.Provider>
    </QueryClientProvider>,
  );
}

describe('ProductDetailPage', () => {
  it('shows operational catalog data without any cost field', async () => {
    renderPage({
      api: createApi(),
      permissions: ['catalog.read', 'pricing.sale.read'],
    });
    expect(await screen.findByText('Sản phẩm A')).toBeInTheDocument();
    expect(screen.getByText(/25\.000/)).toBeInTheDocument();
    expect(screen.getByText('4 Hộp')).toBeInTheDocument();
    expect(screen.queryByText(/giá vốn/i)).not.toBeInTheDocument();
    expect(screen.queryByText('Lịch sử giá bán')).not.toBeInTheDocument();
  });

  it('falls back to overview when a purchase tab is not permitted', async () => {
    renderPage({
      api: createApi(),
      permissions: ['catalog.read'],
      initialEntry: `/products/${detail.id}?tab=suppliers`,
    });
    expect(await screen.findByText('Mô tả sản phẩm')).toBeInTheDocument();
    expect(
      screen.queryByRole('tab', { name: 'Nhà cung cấp' }),
    ).not.toBeInTheDocument();
  });

  it('shows sale-price history only with owner permission', async () => {
    renderPage({
      api: createApi(),
      permissions: ['catalog.read', 'pricing.sale.manage'],
    });
    expect(await screen.findByText('Lịch sử giá bán')).toBeInTheDocument();
  });

  it('drills through posted suppliers and exposes safe contextual actions', async () => {
    const explorerApi: ConnectedExplorerApi = {
      productContext: vi.fn(),
      productSuppliers: vi.fn().mockResolvedValue({
        items: [
          {
            supplierId: '10000000-0000-4000-8000-000000000011',
            supplierCode: 'NCC-01',
            supplierName: 'Nhà cung cấp A',
            supplierIsActive: true,
            postedReceiptCount: 2,
            totalReceivedQty: '5',
            lastReceivedAt: '2026-08-31T10:00:00.000Z',
            latestReceiptId: '10000000-0000-4000-8000-000000000012',
            latestReceiptNumber: 'PN000001',
            latestUnitCost: null,
            canReadCost: false,
          },
        ],
        nextCursor: null,
      }),
      supplierDetail: vi.fn(),
      supplierProducts: vi.fn(),
      postedPurchaseHistory: vi.fn(),
    };
    renderPage({
      api: createApi(),
      explorerApi,
      permissions: [
        'catalog.read',
        'supplier.read',
        'purchase.operational.read',
        'purchase.draft.manage',
        'sale.draft.manage',
      ],
      initialEntry: `/products/${detail.id}?tab=suppliers`,
    });

    expect(await screen.findByText('Nhà cung cấp A')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Bán hàng' })).toHaveAttribute(
      'href',
      `/pos?focusProduct=${detail.id}`,
    );
    expect(screen.getByRole('link', { name: 'Nhập hàng' })).toHaveAttribute(
      'href',
      `/more/purchases/new?productId=${detail.id}`,
    );
    expect(
      screen.getByRole('link', { name: 'Nhà cung cấp A' }),
    ).toHaveAttribute(
      'href',
      '/more/suppliers/10000000-0000-4000-8000-000000000011',
    );
    expect(
      screen.getByRole('link', { name: 'Nhập từ NCC này' }),
    ).toHaveAttribute(
      'href',
      `/more/purchases/new?productId=${detail.id}&supplierId=10000000-0000-4000-8000-000000000011`,
    );
    expect(screen.queryByText(/đơn giá gần nhất/i)).not.toBeInTheDocument();
  });

  it('creates the product before applying its owner-supplied price', async () => {
    const user = userEvent.setup();
    const saveProduct = vi.fn().mockResolvedValue({
      productId: detail.id,
      version: 1,
    });
    const setSalePrice = vi.fn().mockResolvedValue(undefined);
    renderPage({
      api: createApi({ saveProduct, setSalePrice }),
      mode: 'create',
      permissions: [
        'catalog.read',
        'catalog.basic.manage',
        'pricing.sale.manage',
      ],
    });

    await user.type(await screen.findByLabelText('SKU'), 'SP-NEW');
    await user.type(screen.getByLabelText('Tên sản phẩm'), 'Sản phẩm mới');
    await user.type(screen.getByLabelText('Đơn vị tính'), 'Hộp');
    await user.type(screen.getByLabelText('Giá bán hiện hành'), '30000');
    await user.click(screen.getByRole('button', { name: 'Lưu sản phẩm' }));

    await waitFor(() => expect(saveProduct).toHaveBeenCalledOnce());
    expect(setSalePrice).toHaveBeenCalledWith(
      expect.objectContaining({ productId: detail.id, salePrice: '30000' }),
    );
    expect(saveProduct.mock.invocationCallOrder[0]).toBeLessThan(
      setSalePrice.mock.invocationCallOrder[0] ?? 0,
    );
  });

  it('sends the loaded expected version when editing', async () => {
    const user = userEvent.setup();
    const saveProduct = vi.fn().mockResolvedValue({
      productId: detail.id,
      version: 4,
    });
    renderPage({
      api: createApi({ saveProduct }),
      mode: 'edit',
      permissions: ['catalog.read', 'catalog.basic.manage'],
    });
    await screen.findByDisplayValue('Sản phẩm A');
    await user.click(screen.getByRole('button', { name: 'Lưu sản phẩm' }));
    await waitFor(() =>
      expect(saveProduct).toHaveBeenCalledWith(
        expect.objectContaining({ productId: detail.id, expectedVersion: 3 }),
      ),
    );
  });
});

it('hides sale price and all actions when only inventory and catalog reads are granted', async () => {
  renderPage({
    api: createApi(),
    permissions: ['catalog.read', 'inventory.read'],
  });
  expect(await screen.findByText('4 Hộp')).toBeVisible();
  expect(screen.queryByText(/25\.000/)).not.toBeInTheDocument();
  expect(screen.queryByText('Giá bán hiện hành')).not.toBeInTheDocument();
  expect(
    screen.queryByRole('link', { name: 'Sửa sản phẩm' }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole('link', { name: /Bán hàng|Nhập hàng/ }),
  ).not.toBeInTheDocument();
});
