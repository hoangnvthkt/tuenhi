import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { ProductDetail } from './catalog-types';
import type { ProductImageApi } from './product-image-api';
import { ProductImageManager } from './ProductImageManager';

const productId = '10000000-0000-4000-8000-000000000001';
const image: ProductDetail['images'][number] = {
  id: '10000000-0000-4000-8000-000000000002',
  objectPath: `products/${productId}/10000000-0000-4000-8000-000000000003.jpg`,
  sortOrder: 0,
  isPrimary: true,
};

function createApi(overrides: Partial<ProductImageApi> = {}): ProductImageApi {
  return {
    upload: vi.fn().mockResolvedValue({
      productImageId: image.id,
      objectPath: image.objectPath,
    }),
    remove: vi.fn().mockResolvedValue({}),
    createSignedUrl: vi
      .fn()
      .mockResolvedValue('https://signed.example.invalid/image.jpg'),
    ...overrides,
  };
}

function renderManager({
  api,
  images = [image],
  canManage = true,
  isOnline = true,
  onChanged = vi.fn().mockResolvedValue(undefined),
}: {
  api: ProductImageApi;
  images?: ProductDetail['images'];
  canManage?: boolean;
  isOnline?: boolean;
  onChanged?: () => Promise<void>;
}) {
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <ProductImageManager
        productId={productId}
        images={images}
        canManage={canManage}
        isOnline={isOnline}
        api={api}
        onChanged={onChanged}
      />
    </QueryClientProvider>,
  );
}

describe('ProductImageManager', () => {
  it('renders private images through signed URLs and hides controls from readers', async () => {
    renderManager({ api: createApi(), canManage: false });
    expect(
      await screen.findByRole('img', { name: 'Ảnh sản phẩm' }),
    ).toHaveAttribute('src', 'https://signed.example.invalid/image.jpg');
    expect(
      screen.queryByLabelText('Chọn ảnh sản phẩm'),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /xóa ảnh/i }),
    ).not.toBeInTheDocument();
  });

  it('uploads a generated-path image then refreshes the product', async () => {
    const user = userEvent.setup();
    const upload = vi.fn().mockResolvedValue({
      productImageId: image.id,
      objectPath: image.objectPath,
    });
    const onChanged = vi.fn().mockResolvedValue(undefined);
    renderManager({ api: createApi({ upload }), images: [], onChanged });
    await user.upload(
      screen.getByLabelText('Chọn ảnh sản phẩm'),
      new File(['image'], 'san-pham.jpg', { type: 'image/jpeg' }),
    );
    await user.click(screen.getByRole('button', { name: 'Tải ảnh lên' }));
    await waitFor(() =>
      expect(upload).toHaveBeenCalledWith(
        expect.objectContaining({
          productId,
          sortOrder: 0,
          isPrimary: true,
          idempotencyKey: expect.any(String),
        }),
      ),
    );
    expect(onChanged).toHaveBeenCalled();
  });

  it('shows retryable cleanup warning after metadata-first removal', async () => {
    const user = userEvent.setup();
    const remove = vi
      .fn()
      .mockResolvedValue({ cleanupWarning: 'Cần dọn tệp lưu trữ.' });
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    renderManager({ api: createApi({ remove }) });
    await user.click(
      await screen.findByRole('button', { name: 'Xóa ảnh sản phẩm' }),
    );
    expect(await screen.findByText('Cần dọn tệp lưu trữ.')).toBeInTheDocument();
    expect(remove).toHaveBeenCalledWith({
      productImageId: image.id,
      idempotencyKey: expect.any(String),
    });
    vi.mocked(window.confirm).mockRestore();
  });

  it('locks writes offline and at the five-image limit', () => {
    const five = Array.from({ length: 5 }, (_, index) => ({
      ...image,
      id: `10000000-0000-4000-8000-00000000000${index + 2}`,
      objectPath: `${image.objectPath}-${index}`,
    }));
    renderManager({ api: createApi(), images: five, isOnline: false });
    expect(
      screen.getByText('Đã đạt tối đa 5 ảnh cho sản phẩm.'),
    ).toBeInTheDocument();
    expect(
      screen.getAllByRole('button', { name: 'Xóa ảnh sản phẩm' })[0],
    ).toBeDisabled();
  });
});
