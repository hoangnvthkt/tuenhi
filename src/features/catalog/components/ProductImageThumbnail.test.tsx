import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ProductImageApi } from '../api/product-image-api';
import { ProductImageThumbnail } from './ProductImageThumbnail';

function renderThumbnail({
  objectPath,
  api,
  productId,
  loadPrimaryImagePath,
}: {
  objectPath: string | null | undefined;
  api: ProductImageApi;
  productId?: string;
  loadPrimaryImagePath?: (productId: string) => Promise<string | null>;
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
        productId={productId}
        loadPrimaryImagePath={loadPrimaryImagePath}
      />
    </QueryClientProvider>,
  );
}

describe('ProductImageThumbnail', () => {
  it('hydrates an unknown image path for a reopened product and renders its signed image', async () => {
    const loadPrimaryImagePath = vi
      .fn()
      .mockResolvedValue('products/product-a/main.jpg');
    const createSignedUrl = vi
      .fn()
      .mockResolvedValue('https://signed.example.invalid/reopened.jpg');
    renderThumbnail({
      objectPath: undefined,
      productId: 'product-a',
      loadPrimaryImagePath,
      api: { createSignedUrl, upload: vi.fn(), remove: vi.fn() },
    });

    expect(
      await screen.findByRole('img', { name: 'Ảnh chính của Sản phẩm A' }),
    ).toHaveAttribute('src', 'https://signed.example.invalid/reopened.jpg');
    expect(loadPrimaryImagePath).toHaveBeenCalledWith('product-a');
    expect(createSignedUrl).toHaveBeenCalledWith('products/product-a/main.jpg');
  });

  it.each([null, 'products/product-a/main.jpg'])(
    'does not request metadata for a known path %j',
    async (objectPath) => {
      const loadPrimaryImagePath = vi
        .fn()
        .mockResolvedValue('products/product-a/unexpected.jpg');
      renderThumbnail({
        objectPath,
        productId: 'product-a',
        loadPrimaryImagePath,
        api: {
          createSignedUrl: vi
            .fn()
            .mockResolvedValue('https://signed.example.invalid/product.jpg'),
          upload: vi.fn(),
          remove: vi.fn(),
        },
      });
      if (objectPath) await screen.findByRole('img');
      else expect(screen.getByLabelText('Chưa có ảnh')).toBeInTheDocument();
      expect(loadPrimaryImagePath).not.toHaveBeenCalled();
    },
  );

  it('keeps the placeholder without metadata when both the path and product ID are unknown', () => {
    const loadPrimaryImagePath = vi.fn();
    renderThumbnail({
      objectPath: undefined,
      loadPrimaryImagePath,
      api: { createSignedUrl: vi.fn(), upload: vi.fn(), remove: vi.fn() },
    });
    expect(screen.getByLabelText('Chưa có ảnh')).toBeInTheDocument();
    expect(loadPrimaryImagePath).not.toHaveBeenCalled();
  });

  it.each(['no image', 'metadata denied'])(
    'uses the placeholder when product metadata yields %s',
    async (outcome) => {
      const loadPrimaryImagePath =
        outcome === 'no image'
          ? vi.fn().mockResolvedValue(null)
          : vi.fn().mockRejectedValue(new Error('denied'));
      const createSignedUrl = vi.fn();
      renderThumbnail({
        objectPath: undefined,
        productId: 'product-a',
        loadPrimaryImagePath,
        api: { createSignedUrl, upload: vi.fn(), remove: vi.fn() },
      });
      expect(await screen.findByLabelText('Chưa có ảnh')).toBeInTheDocument();
      expect(loadPrimaryImagePath).toHaveBeenCalledWith('product-a');
      expect(createSignedUrl).not.toHaveBeenCalled();
    },
  );

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
