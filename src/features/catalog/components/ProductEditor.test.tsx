import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { useState } from 'react';
import { expect, it, vi } from 'vitest';
import { ProductEditor } from './ProductEditor';
import { CatalogApiError } from '../api/catalog-api';
import type { ProductDetail } from '../model/catalog-types';
const detail = {
  id: 'p1',
  name: 'Tên ban đầu',
  sku: 'A',
  unitName: 'Hộp',
  version: 1,
  minStockQty: '0',
  currentSalePrice: '100',
  barcode: null,
  categoryId: null,
  description: null,
  isActive: true,
} as ProductDetail;
function mount(onSave = vi.fn().mockResolvedValue('p1')) {
  let publish!: (value: ProductDetail) => void;
  function Editor() {
    const [remote, setRemote] = useState(detail);
    publish = setRemote;
    return (
      <ProductEditor
        canManageSalePrice
        categories={[]}
        detail={remote}
        isOnline
        mode="edit"
        onSave={onSave}
      />
    );
  }
  const router = createMemoryRouter(
    [
      { path: '/edit', element: <Editor /> },
      { path: '/products/:id', element: <p>Chi tiết</p> },
    ],
    { initialEntries: ['/products/p1', '/edit'], initialIndex: 1 },
  );
  render(<RouterProvider router={router} />);
  return {
    publish: (value: ProductDetail) => act(() => publish(value)),
    router,
    onSave,
  };
}
it('keeps dirty values and their base version when a newer server version arrives', async () => {
  const onSave = vi
    .fn()
    .mockRejectedValue(new CatalogApiError('VERSION_CONFLICT', 'id', {}));
  const view = mount(onSave);
  fireEvent.change(screen.getByLabelText('Tên sản phẩm'), {
    target: { value: 'Tên đang nhập' },
  });
  view.publish({
    ...detail,
    version: 2,
    name: 'Tên mới trên máy chủ',
    currentSalePrice: '200',
  });
  expect(screen.getByLabelText('Tên sản phẩm')).toHaveValue('Tên đang nhập');
  fireEvent.click(screen.getByRole('button', { name: 'Lưu sản phẩm' }));
  await waitFor(() =>
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        expectedVersion: 1,
        initialSalePrice: '100',
        values: expect.objectContaining({ name: 'Tên đang nhập' }),
      }),
    ),
  );
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'đã được người khác cập nhật',
  );
  expect(onSave).toHaveBeenCalledOnce();
});
it('requires explicit discard before refreshing dirty fields, but refreshes pristine fields', async () => {
  const view = mount();
  view.publish({ ...detail, version: 2, name: 'Tên mới' });
  expect(screen.getByLabelText('Tên sản phẩm')).toHaveValue('Tên mới');
  fireEvent.change(screen.getByLabelText('Tên sản phẩm'), {
    target: { value: 'Chưa lưu' },
  });
  view.publish({ ...detail, version: 3, name: 'Bản mới nhất' });
  fireEvent.click(screen.getByRole('button', { name: 'Tải bản mới' }));
  expect(screen.getByLabelText('Tên sản phẩm')).toHaveValue('Chưa lưu');
  fireEvent.click(
    screen.getByRole('button', { name: 'Bỏ thay đổi và tải lại' }),
  );
  expect(screen.getByLabelText('Tên sản phẩm')).toHaveValue('Bản mới nhất');
});
it('guards back navigation and browser close, then allows navigation after saving', async () => {
  const view = mount();
  fireEvent.change(screen.getByLabelText('Tên sản phẩm'), {
    target: { value: 'Đã sửa' },
  });
  const event = new Event('beforeunload', { cancelable: true });
  window.dispatchEvent(event);
  expect(event.defaultPrevented).toBe(true);
  await act(() => view.router.navigate(-1));
  expect(screen.getByRole('button', { name: 'Ở lại chỉnh sửa' })).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Ở lại chỉnh sửa' }));
  fireEvent.click(screen.getByRole('button', { name: 'Lưu sản phẩm' }));
  expect(await screen.findByText('Chi tiết')).toBeVisible();
});
