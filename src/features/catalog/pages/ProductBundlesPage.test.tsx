import { fireEvent, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { beforeEach, expect, it, vi } from 'vitest';
import { renderWithQueryClient } from '@/shared/testing/render-with-query-client';
import { CatalogApiError } from '../api/catalog-api';
import { ProductBundlesPage } from './ProductBundlesPage';

const mocks = vi.hoisted(() => ({
  listBundles: vi.fn(),
  saveBundle: vi.fn(),
}));
vi.mock('../api/catalog-api', async (original) => ({
  ...(await original<typeof import('../api/catalog-api')>()),
  createCatalogApi: () => mocks,
}));
vi.mock('@/shared/hooks/use-online-status', () => ({
  useOnlineStatus: () => true,
}));

const bundle = {
  id: '40000000-0000-4000-8000-000000000001',
  name: 'Gói cảm cúm',
  isActive: true,
  version: 3,
  lines: [
    {
      productId: '30000000-0000-4000-8000-000000000001',
      productName: 'Panadol',
      sku: 'P1',
      unitName: 'Hộp',
      quantity: '2',
      isActive: true,
      currentSalePrice: '15000',
      onHandQty: '5',
      primaryImagePath: null,
    },
  ],
};
const renderPage = () =>
  renderWithQueryClient(
    <MemoryRouter>
      <ProductBundlesPage />
    </MemoryRouter>,
  );

beforeEach(() => {
  vi.clearAllMocks();
  mocks.listBundles.mockResolvedValue([bundle]);
  mocks.saveBundle.mockResolvedValue(undefined);
});

it('edits a bundle with its expected version and has no bundle price', async () => {
  renderPage();
  fireEvent.click(
    await screen.findByRole('button', { name: 'Sửa Gói cảm cúm' }),
  );
  fireEvent.change(screen.getByLabelText('Số lượng Panadol'), {
    target: { value: '3' },
  });
  expect(screen.queryByText(/Giá gói/)).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Lưu gói' }));
  await waitFor(() =>
    expect(mocks.saveBundle).toHaveBeenCalledWith(
      expect.objectContaining({
        bundleId: bundle.id,
        expectedVersion: 3,
        name: 'Gói cảm cúm',
        isActive: true,
        lines: [{ productId: bundle.lines[0]!.productId, quantity: '3' }],
      }),
    ),
  );
  await waitFor(() =>
    expect(screen.queryByRole('form')).not.toBeInTheDocument(),
  );
});

it('requires a name and at least one item, and shows server errors', async () => {
  renderPage();
  fireEvent.click(await screen.findByRole('button', { name: 'Thêm gói' }));
  fireEvent.click(screen.getByRole('button', { name: 'Lưu gói' }));
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Nhập tên gói và ít nhất một thuốc',
  );
  expect(mocks.saveBundle).not.toHaveBeenCalled();
  mocks.saveBundle.mockRejectedValue(
    new CatalogApiError('DUPLICATE_IN_DATABASE', 'c', {}),
  );
  fireEvent.click(screen.getByRole('button', { name: 'Hủy' }));
  fireEvent.click(screen.getByRole('button', { name: 'Sửa Gói cảm cúm' }));
  fireEvent.click(screen.getByRole('button', { name: 'Lưu gói' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('đã tồn tại');
});

it('shows load errors with retry instead of an empty list', async () => {
  mocks.listBundles.mockRejectedValue(new Error('down'));
  renderPage();
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Không tải được gói hàng.',
  );
  expect(screen.queryByText('Chưa có gói hàng.')).not.toBeInTheDocument();
});
