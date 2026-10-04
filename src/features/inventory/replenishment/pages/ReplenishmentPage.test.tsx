import { fireEvent, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { beforeEach, expect, it, vi } from 'vitest';
import { renderWithQueryClient } from '@/shared/testing/render-with-query-client';
import { ReplenishmentPage } from './ReplenishmentPage';
const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  permissions: ['catalog.read', 'inventory.read', 'purchase.draft.manage'],
}));
vi.mock('@/features/auth', async (original) => ({
  ...(await original<typeof import('@/features/auth')>()),
  useSession: () => ({
    session: { userId: 'u', permissions: mocks.permissions },
  }),
}));
vi.mock('@/features/catalog', () => ({
  createCatalogApi: () => ({ list: mocks.list }),
}));
const item = {
  id: '10000000-0000-4000-8000-000000000001',
  name: 'Thuốc A',
  sku: 'A',
  barcode: null,
  categoryId: null,
  categoryName: null,
  unitName: 'hộp',
  minStockQty: '0',
  effectiveMinStockQty: '50',
  isActive: true,
  version: 1,
  primaryImagePath: null,
  currentSalePrice: '999',
  onHandQty: '49',
};
beforeEach(() => {
  vi.clearAllMocks();
  mocks.permissions = [
    'catalog.read',
    'inventory.read',
    'purchase.draft.manage',
  ];
  mocks.list.mockResolvedValue({ items: [item], nextCursor: null });
});
const setup = () =>
  renderWithQueryClient(
    <MemoryRouter>
      <ReplenishmentPage />
    </MemoryRouter>,
  );
it('shows strict shortage and a context link without a write, hiding prices', async () => {
  setup();
  await screen.findByText('Thuốc A');
  expect(screen.getByText('Thiếu tới ngưỡng: 1 hộp')).toBeVisible();
  expect(screen.queryByText(/999/)).not.toBeInTheDocument();
  expect(screen.getByRole('link', { name: /Lập phiếu nhập/ })).toHaveAttribute(
    'href',
    `/more/purchases/new?productId=${item.id}`,
  );
  expect(mocks.list).toHaveBeenCalledWith(
    expect.objectContaining({
      stockState: 'LOW_STOCK',
      includeInactive: false,
    }),
  );
});
it('does not offer writes to viewers; paginates and excludes inactive or exactly-at-threshold rows', async () => {
  mocks.permissions = ['catalog.read', 'inventory.read'];
  mocks.list.mockImplementation(async ({ cursor }) =>
    cursor
      ? {
          items: [{ ...item, id: 'other', name: 'Thuốc B', onHandQty: '0' }],
          nextCursor: null,
        }
      : {
          items: [
            item,
            { ...item, id: 'equal', name: 'Đã đủ', onHandQty: '50' },
            { ...item, id: 'inactive', name: 'Đã ngừng', isActive: false },
          ],
          nextCursor: { id: item.id, name: 'Thuốc A' },
        },
  );
  setup();
  await screen.findByText('Thuốc A');
  expect(screen.queryByText('Đã đủ')).not.toBeInTheDocument();
  expect(screen.queryByText('Đã ngừng')).not.toBeInTheDocument();
  expect(
    screen.queryByRole('link', { name: /Lập phiếu/ }),
  ).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /Tải thêm/ }));
  await screen.findByText('Thuốc B');
});
it('does not invent a threshold and supports retry after a read error', async () => {
  mocks.list.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({
    items: [{ ...item, effectiveMinStockQty: undefined }],
    nextCursor: null,
  });
  setup();
  fireEvent.click(await screen.findByRole('button', { name: /Thử lại/ }));
  await screen.findByText('Thuốc A');
  expect(screen.getAllByText(/Chưa xác định/).length).toBeGreaterThan(0);
});

it('refreshes shortages after another screen posts a stock operation', async () => {
  const { refreshOperationalData } =
    await import('@/shared/api/refresh-operational-data');
  const view = setup();
  await screen.findByText('Thuốc A');
  mocks.list.mockResolvedValue({ items: [], nextCursor: null });
  await refreshOperationalData(view.queryClient);
  await waitFor(() =>
    expect(screen.queryByText('Thuốc A')).not.toBeInTheDocument(),
  );
});
