import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { CatalogApiError } from '../api/catalog-api';
import { ProductForm } from './ProductForm';

const categories = [
  {
    id: '10000000-0000-4000-8000-000000000001',
    name: 'Thực phẩm',
    isActive: true,
  },
];

describe('ProductForm', () => {
  it('submits canonical values with stable idempotency keys', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(
      <ProductForm
        categories={categories}
        canManageSalePrice
        isOnline
        onSave={onSave}
      />,
    );

    await user.type(screen.getByLabelText('SKU'), 'SP-001');
    await user.type(screen.getByLabelText('Tên sản phẩm'), 'Sản phẩm A');
    await user.type(screen.getByLabelText('Đơn vị tính'), 'Hộp');
    await user.type(screen.getByLabelText('Giá bán hiện hành'), '25000');
    await user.click(screen.getByRole('button', { name: 'Lưu sản phẩm' }));

    await waitFor(() => expect(onSave).toHaveBeenCalledOnce());
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        values: expect.objectContaining({
          sku: 'SP-001',
          name: 'Sản phẩm A',
          minStockQty: '0',
          salePrice: '25000',
        }),
        productIdempotencyKey: expect.any(String),
        priceIdempotencyKey: expect.any(String),
      }),
    );
  });

  it('reuses idempotency keys while the network outcome is unknown', async () => {
    const user = userEvent.setup();
    const onSave = vi
      .fn()
      .mockRejectedValueOnce(new Error('network'))
      .mockResolvedValueOnce(undefined);
    render(
      <ProductForm
        categories={categories}
        canManageSalePrice
        isOnline
        onSave={onSave}
      />,
    );
    await user.type(screen.getByLabelText('SKU'), 'SP-001');
    await user.type(screen.getByLabelText('Tên sản phẩm'), 'Sản phẩm A');
    await user.type(screen.getByLabelText('Đơn vị tính'), 'Hộp');
    await user.click(screen.getByRole('button', { name: 'Lưu sản phẩm' }));
    expect(
      await screen.findByText(
        'Chưa xác định được kết quả. Hệ thống sẽ kiểm tra lại sản phẩm trước khi gửi lại.',
      ),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Thử lưu lại' }));

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(2));
    expect(onSave.mock.calls[1]?.[0].productIdempotencyKey).toBe(
      onSave.mock.calls[0]?.[0].productIdempotencyKey,
    );
    expect(onSave.mock.calls[1]?.[0].priceIdempotencyKey).toBe(
      onSave.mock.calls[0]?.[0].priceIdempotencyKey,
    );
  });

  it('shows safe duplicate and version-conflict errors', async () => {
    const user = userEvent.setup();
    const onSave = vi
      .fn()
      .mockRejectedValueOnce(
        new CatalogApiError(
          'DUPLICATE_IN_DATABASE',
          '20000000-0000-4000-8000-000000000002',
          {},
        ),
      )
      .mockRejectedValueOnce(
        new CatalogApiError(
          'VERSION_CONFLICT',
          '20000000-0000-4000-8000-000000000003',
          { currentVersion: 2 },
        ),
      );
    render(
      <ProductForm
        categories={categories}
        canManageSalePrice
        isOnline
        onSave={onSave}
      />,
    );
    await user.type(screen.getByLabelText('SKU'), 'SP-001');
    await user.type(screen.getByLabelText('Tên sản phẩm'), 'Sản phẩm A');
    await user.type(screen.getByLabelText('Đơn vị tính'), 'Hộp');
    await user.click(screen.getByRole('button', { name: 'Lưu sản phẩm' }));
    expect(
      await screen.findByText('SKU hoặc mã vạch đã tồn tại.'),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Lưu sản phẩm' }));
    expect(
      await screen.findByText(
        'Sản phẩm đã được người khác cập nhật. Vui lòng tải lại dữ liệu.',
      ),
    ).toBeInTheDocument();
  });

  it('locks writes offline and omits the price field without permission', () => {
    render(
      <ProductForm
        categories={categories}
        canManageSalePrice={false}
        isOnline={false}
        onSave={vi.fn()}
      />,
    );
    expect(
      screen.queryByLabelText('Giá bán hiện hành'),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Lưu sản phẩm' })).toBeDisabled();
    expect(
      screen.getByText('Cần kết nối mạng để lưu sản phẩm.'),
    ).toBeInTheDocument();
  });
});
