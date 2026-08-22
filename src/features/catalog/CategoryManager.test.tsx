import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { CatalogApiError, type CatalogApi } from './catalog-api';
import { CategoryManager } from './CategoryManager';

const category = {
  id: '10000000-0000-4000-8000-000000000001',
  name: 'Thực phẩm',
  isActive: true,
};

function createApi(overrides: Partial<CatalogApi> = {}): CatalogApi {
  return {
    list: vi.fn(),
    detail: vi.fn(),
    listCategories: vi.fn().mockResolvedValue([category]),
    priceHistory: vi.fn(),
    saveProduct: vi.fn(),
    setSalePrice: vi.fn(),
    saveCategory: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function renderManager(api: CatalogApi, isOnline = true) {
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <CategoryManager api={api} isOnline={isOnline} />
    </QueryClientProvider>,
  );
}

describe('CategoryManager', () => {
  it('adds, renames and deactivates categories without exposing delete', async () => {
    const user = userEvent.setup();
    const saveCategory = vi.fn().mockResolvedValue(undefined);
    renderManager(createApi({ saveCategory }));

    await screen.findByLabelText('Tên nhóm Thực phẩm');
    expect(
      screen.queryByRole('button', { name: /xóa/i }),
    ).not.toBeInTheDocument();

    await user.type(screen.getByLabelText('Tên nhóm hàng mới'), 'Dược phẩm');
    await user.click(screen.getByRole('button', { name: 'Thêm nhóm' }));
    await waitFor(() =>
      expect(saveCategory).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Dược phẩm', isActive: true }),
      ),
    );

    await user.clear(screen.getByLabelText('Tên nhóm Thực phẩm'));
    await user.type(
      screen.getByLabelText('Tên nhóm Thực phẩm'),
      'Thực phẩm bổ sung',
    );
    await user.click(
      screen.getByRole('button', { name: 'Lưu nhóm Thực phẩm' }),
    );
    await waitFor(() =>
      expect(saveCategory).toHaveBeenCalledWith(
        expect.objectContaining({
          categoryId: category.id,
          name: 'Thực phẩm bổ sung',
          isActive: true,
        }),
      ),
    );

    await user.click(
      screen.getByRole('button', { name: 'Ngừng nhóm Thực phẩm' }),
    );
    await waitFor(() =>
      expect(saveCategory).toHaveBeenCalledWith(
        expect.objectContaining({ categoryId: category.id, isActive: false }),
      ),
    );
  });

  it('shows a safe Vietnamese error when a category is in use', async () => {
    const user = userEvent.setup();
    const saveCategory = vi
      .fn()
      .mockRejectedValue(
        new CatalogApiError(
          'CATEGORY_IN_USE',
          '20000000-0000-4000-8000-000000000002',
          {},
        ),
      );
    renderManager(createApi({ saveCategory }));

    await user.click(
      await screen.findByRole('button', { name: 'Ngừng nhóm Thực phẩm' }),
    );
    expect(
      await screen.findByText(
        'Nhóm hàng đang được sản phẩm sử dụng nên chưa thể ngừng hoạt động.',
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText('20000000-0000-4000-8000-000000000002'),
    ).toBeInTheDocument();
  });

  it('locks all category writes while offline', async () => {
    renderManager(createApi(), false);
    await screen.findByLabelText('Tên nhóm Thực phẩm');
    expect(screen.getByRole('button', { name: 'Thêm nhóm' })).toBeDisabled();
    expect(
      screen.getByRole('button', { name: 'Lưu nhóm Thực phẩm' }),
    ).toBeDisabled();
    expect(
      screen.getByRole('button', { name: 'Ngừng nhóm Thực phẩm' }),
    ).toBeDisabled();
    expect(
      screen.getByText('Cần kết nối mạng để cập nhật nhóm hàng.'),
    ).toBeInTheDocument();
  });
});
