import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '@/shared/ui/feedback/ToastProvider';
import { SessionContextValue } from '@/features/auth';
import { CatalogApiError, type CatalogApi } from '../api/catalog-api';
import type { CatalogPage } from '../model/catalog-types';
import { ProductListPage } from './ProductListPage';

const emptyPage: CatalogPage = { items: [], nextCursor: null };

function createApi(overrides: Partial<CatalogApi> = {}): CatalogApi {
  return {
    list: vi.fn().mockResolvedValue(emptyPage),
    detail: vi.fn(),
    listCategories: vi.fn().mockResolvedValue([
      {
        id: '10000000-0000-4000-8000-000000000001',
        name: 'Thực phẩm',
        isActive: true,
      },
    ]),
    priceHistory: vi.fn(),
    saveProduct: vi.fn(),
    setSalePrice: vi.fn(),
    saveCategory: vi.fn(),
    ...overrides,
  };
}

function renderPage(api: CatalogApi, permissions: string[] = ['catalog.read']) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  render(
    <QueryClientProvider client={queryClient}>
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
          <MemoryRouter>
            <ProductListPage api={api} />
          </MemoryRouter>
        </ToastProvider>
      </SessionContextValue.Provider>
    </QueryClientProvider>,
  );
}

describe('ProductListPage', () => {
  it('summarizes only the visible page and lets the user hide sale prices', async () => {
    const user = userEvent.setup();
    const product = {
      id: '10000000-0000-4000-8000-000000000030',
      sku: 'SP527986',
      barcode: null,
      name: 'Ferromax hoa quả',
      categoryId: null,
      categoryName: null,
      unitName: 'Hộp',
      minStockQty: '10',
      isActive: true,
      version: 1,
      primaryImagePath: null,
      currentSalePrice: '57000.00',
      onHandQty: '86',
    };
    renderPage(
      createApi({
        list: vi.fn().mockResolvedValue({
          items: [
            product,
            {
              ...product,
              id: '10000000-0000-4000-8000-000000000031',
              name: 'Canxi mk7 ống trắng dài',
              sku: 'SP527984',
              onHandQty: '37',
            },
          ],
          nextCursor: { name: 'canxi', id: product.id },
        }),
      }),
      ['catalog.read', 'pricing.sale.read'],
    );

    expect(
      await screen.findByText('2 hàng hóa trên trang này'),
    ).toBeInTheDocument();
    expect(
      within(
        screen.getByRole('region', { name: 'Tổng tồn trên trang này' }),
      ).getByText('123'),
    ).toBeInTheDocument();
    expect(
      within(screen.getByTestId(`product-row-${product.id}`)).getByText(
        '57.000',
      ),
    ).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText('Hiển thị giá'), 'stock');
    expect(screen.queryByText('57.000')).not.toBeInTheDocument();
    expect(screen.getByText('Tồn: 86')).toBeInTheDocument();
    await user.click(
      screen.getByRole('button', { name: 'Đảo thứ tự tên trên trang' }),
    );
    expect(screen.getAllByTestId(/^product-row-/)[0]).toHaveTextContent(
      'Ferromax hoa quả',
    );
  });

  it('applies the category chip immediately without needing to open advanced filters', async () => {
    const user = userEvent.setup();
    const list = vi.fn().mockResolvedValue(emptyPage);
    renderPage(createApi({ list }));
    await screen.findByText('Chưa có sản phẩm.');
    await user.selectOptions(
      screen.getByLabelText('Nhóm hàng'),
      '10000000-0000-4000-8000-000000000001',
    );
    await waitFor(() =>
      expect(list).toHaveBeenLastCalledWith(
        expect.objectContaining({
          categoryId: '10000000-0000-4000-8000-000000000001',
          cursor: undefined,
        }),
      ),
    );
  });

  it('does not apply an unsubmitted search draft when changing categories', async () => {
    const user = userEvent.setup();
    const list = vi.fn().mockResolvedValue(emptyPage);
    renderPage(createApi({ list }));
    await screen.findByText('Chưa có sản phẩm.');
    await user.click(screen.getByRole('button', { name: 'Mở tìm kiếm' }));
    await user.type(screen.getByLabelText('Tìm sản phẩm'), 'chưa áp dụng');
    await user.selectOptions(
      screen.getByLabelText('Nhóm hàng'),
      '10000000-0000-4000-8000-000000000001',
    );
    await waitFor(() =>
      expect(list).toHaveBeenLastCalledWith(
        expect.objectContaining({
          search: '',
          categoryId: '10000000-0000-4000-8000-000000000001',
        }),
      ),
    );
    await user.click(screen.getByRole('button', { name: 'Đóng tìm kiếm' }));
    await user.click(screen.getByRole('button', { name: 'Mở tìm kiếm' }));
    expect(screen.getByLabelText('Tìm sản phẩm')).toHaveValue('');
  });

  it('keeps an applied search visible when closed and lets the user clear it', async () => {
    const user = userEvent.setup();
    const list = vi.fn().mockResolvedValue(emptyPage);
    renderPage(createApi({ list }));
    await screen.findByText('Chưa có sản phẩm.');
    await user.click(screen.getByRole('button', { name: 'Mở tìm kiếm' }));
    await user.type(screen.getByLabelText('Tìm sản phẩm'), 'SP527986');
    await user.click(screen.getByRole('button', { name: 'Tìm kiếm' }));
    await user.click(screen.getByRole('button', { name: 'Đóng tìm kiếm' }));
    expect(screen.getByText('Đang tìm: SP527986')).toBeVisible();
    await user.click(
      screen.getByRole('button', { name: 'Xóa tìm kiếm đang áp dụng' }),
    );
    await waitFor(() =>
      expect(list).toHaveBeenLastCalledWith(
        expect.objectContaining({ search: '' }),
      ),
    );
    expect(screen.queryByText('Đang tìm: SP527986')).not.toBeInTheDocument();
  });

  it('shows a stable skeleton then an actionable empty state', async () => {
    let resolvePage!: (page: CatalogPage) => void;
    renderPage(
      createApi({
        list: vi.fn(
          () =>
            new Promise<CatalogPage>((resolve) => {
              resolvePage = resolve;
            }),
        ),
      }),
      ['catalog.read', 'catalog.basic.manage'],
    );

    expect(screen.getAllByLabelText('Đang tải sản phẩm')).toHaveLength(6);
    resolvePage(emptyPage);
    expect(await screen.findByText('Chưa có sản phẩm.')).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Thêm sản phẩm đầu tiên' }),
    ).toHaveAttribute('href', '/products/new');
    expect(
      screen.getByRole('link', { name: 'Quản lý nhóm hàng' }),
    ).toHaveAttribute('href', '/products/categories');
  });

  it('shows safe Vietnamese error copy, correlation ID and retries', async () => {
    const user = userEvent.setup();
    const list = vi
      .fn()
      .mockRejectedValueOnce(
        new CatalogApiError(
          'UNKNOWN',
          '20000000-0000-4000-8000-000000000002',
          {},
        ),
      )
      .mockResolvedValueOnce(emptyPage);
    renderPage(createApi({ list }));

    expect(
      await screen.findByText('Không thể tải danh mục sản phẩm.'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('20000000-0000-4000-8000-000000000002'),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Thử lại' }));
    expect(await screen.findByText('Chưa có sản phẩm.')).toBeInTheDocument();
  });

  it('submits search and filters, then requests the keyset next page', async () => {
    const user = userEvent.setup();
    const list = vi
      .fn()
      .mockResolvedValueOnce({
        items: [
          {
            id: '10000000-0000-4000-8000-000000000010',
            sku: 'SP-001',
            barcode: null,
            name: 'Sản phẩm A',
            categoryId: null,
            categoryName: null,
            unitName: 'Hộp',
            minStockQty: '10',
            isActive: false,
            version: 1,
            primaryImagePath: null,
            currentSalePrice: '25000.00',
            onHandQty: '0',
          },
        ],
        nextCursor: {
          name: 'sản phẩm a',
          id: '10000000-0000-4000-8000-000000000010',
        },
      })
      .mockResolvedValue(emptyPage);
    renderPage(createApi({ list }), [
      'catalog.read',
      'catalog.basic.manage',
      'pricing.sale.read',
    ]);

    expect(await screen.findByText('Sản phẩm A')).toBeInTheDocument();
    const row = screen.getByTestId(
      'product-row-10000000-0000-4000-8000-000000000010',
    );
    expect(within(row).getByLabelText('Chưa có ảnh')).toBeInTheDocument();
    expect(within(row).getByText('Hết hàng')).toBeInTheDocument();
    expect(within(row).getByText('Ngừng hoạt động')).toBeInTheDocument();
    expect(within(row).getByText(/25\.000/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Trang tiếp' }));
    await waitFor(() =>
      expect(list).toHaveBeenCalledWith(
        expect.objectContaining({
          cursor: {
            name: 'sản phẩm a',
            id: '10000000-0000-4000-8000-000000000010',
          },
        }),
      ),
    );

    await user.click(screen.getByRole('button', { name: 'Mở tìm kiếm' }));
    await user.clear(screen.getByLabelText('Tìm sản phẩm'));
    await user.type(screen.getByLabelText('Tìm sản phẩm'), 'SP-001');
    await user.selectOptions(
      screen.getByLabelText('Nhóm hàng'),
      '10000000-0000-4000-8000-000000000001',
    );
    await user.click(screen.getByRole('button', { name: 'Bộ lọc hàng hóa' }));
    await user.selectOptions(
      screen.getByLabelText('Tình trạng tồn'),
      'OUT_OF_STOCK',
    );
    await user.click(screen.getByLabelText('Gồm sản phẩm ngừng hoạt động'));
    await user.click(screen.getByRole('button', { name: 'Tìm kiếm' }));

    await waitFor(() =>
      expect(list).toHaveBeenLastCalledWith(
        expect.objectContaining({
          search: 'SP-001',
          categoryId: '10000000-0000-4000-8000-000000000001',
          stockState: 'OUT_OF_STOCK',
          includeInactive: true,
        }),
      ),
    );
  });

  it('hides create controls without catalog manage permission', async () => {
    renderPage(createApi());
    await screen.findByText('Chưa có sản phẩm.');
    expect(
      screen.queryByRole('link', { name: /Thêm sản phẩm/ }),
    ).not.toBeInTheDocument();
  });
});

it('shows inventory without sale prices and uses a strict low-stock threshold', async () => {
  const product = {
    id: '10000000-0000-4000-8000-000000000020',
    sku: 'KHO-50',
    barcode: null,
    name: 'Còn 50 hộp',
    categoryId: null,
    categoryName: null,
    unitName: 'Hộp',
    minStockQty: '0',
    effectiveMinStockQty: '50',
    isActive: true,
    version: 1,
    primaryImagePath: null,
    currentSalePrice: '25000.00',
    onHandQty: '50',
  };
  renderPage(
    createApi({
      list: vi.fn().mockResolvedValue({
        items: [
          product,
          {
            ...product,
            id: '10000000-0000-4000-8000-000000000021',
            sku: 'KHO-49',
            name: 'Còn 49 hộp',
            onHandQty: '49',
          },
        ],
        nextCursor: null,
      }),
    }),
    ['catalog.read', 'inventory.read'],
  );
  expect(await screen.findByText('Còn 50 hộp')).toBeVisible();
  expect(screen.queryByText('Giá bán')).not.toBeInTheDocument();
  expect(screen.queryByText(/25\.000/)).not.toBeInTheDocument();
  expect(
    within(screen.getByTestId(`product-row-${product.id}`)).getByText(
      'Còn hàng',
    ),
  ).toBeVisible();
  expect(
    within(
      screen.getByTestId('product-row-10000000-0000-4000-8000-000000000021'),
    ).getByText('Sắp hết'),
  ).toBeVisible();
});
