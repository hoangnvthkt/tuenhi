import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ProductImageApi } from '../api/product-image-api';
import { ProductImageThumbnail } from './ProductImageThumbnail';

function renderThumbnail({
  objectPath,
  api,
}: {
  objectPath: string | null;
  api: ProductImageApi;
}) {
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <ProductImageThumbnail
        objectPath={objectPath}
        alt="Ảnh chính của Sản phẩm A"
        api={api}
      />
    </QueryClientProvider>,
  );
}

describe('ProductImageThumbnail', () => {
  it('renders the primary image through a signed URL', async () => {
    const createSignedUrl = vi
      .fn()
      .mockResolvedValue('https://signed.example.invalid/product.jpg');
    renderThumbnail({
      objectPath: 'products/product-a/main.jpg',
      api: {
        createSignedUrl,
        upload: vi.fn(),
        remove: vi.fn(),
      },
    });

    expect(
      await screen.findByRole('img', { name: 'Ảnh chính của Sản phẩm A' }),
    ).toHaveAttribute('src', 'https://signed.example.invalid/product.jpg');
    expect(createSignedUrl).toHaveBeenCalledWith('products/product-a/main.jpg');
  });

  it('uses an accessible fallback when the product has no primary image', () => {
    renderThumbnail({
      objectPath: null,
      api: { createSignedUrl: vi.fn(), upload: vi.fn(), remove: vi.fn() },
    });

    expect(screen.getByLabelText('Chưa có ảnh')).toBeInTheDocument();
  });

  it('uses the same fallback when signing the image URL fails', async () => {
    renderThumbnail({
      objectPath: 'products/product-a/main.jpg',
      api: {
        createSignedUrl: vi.fn().mockRejectedValue(new Error('failed')),
        upload: vi.fn(),
        remove: vi.fn(),
      },
    });

    expect(await screen.findByLabelText('Chưa có ảnh')).toBeInTheDocument();
  });
});
