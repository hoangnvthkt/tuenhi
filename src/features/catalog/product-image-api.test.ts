import { describe, expect, it, vi } from 'vitest';
import {
  createProductImageApi,
  ProductImageApiError,
  type ProductImageTransport,
} from './product-image-api';

const productId = '10000000-0000-4000-8000-000000000001';
const imageId = '10000000-0000-4000-8000-000000000002';

function transport(
  overrides: Partial<ProductImageTransport> = {},
): ProductImageTransport {
  return {
    upload: vi.fn().mockResolvedValue(undefined),
    removeObjects: vi.fn().mockResolvedValue(undefined),
    attachMetadata: vi.fn().mockResolvedValue({ productImageId: imageId }),
    removeMetadata: vi.fn().mockResolvedValue({
      productImageId: imageId,
      objectPath: `products/${productId}/${imageId}.jpg`,
    }),
    createSignedUrl: vi
      .fn()
      .mockResolvedValue('https://signed.example.invalid/image'),
    ...overrides,
  };
}

describe('product image API', () => {
  it('rejects unsupported or oversized files before transport', async () => {
    const current = transport();
    const api = createProductImageApi(current);
    await expect(
      api.upload({
        productId,
        file: new File(['text'], 'x.gif', { type: 'image/gif' }),
        sortOrder: 0,
        isPrimary: true,
        idempotencyKey: crypto.randomUUID(),
      }),
    ).rejects.toMatchObject({ code: 'IMAGE_TYPE_INVALID' });
    await expect(
      api.upload({
        productId,
        file: new File([new Uint8Array(5 * 1024 * 1024 + 1)], 'x.jpg', {
          type: 'image/jpeg',
        }),
        sortOrder: 0,
        isPrimary: true,
        idempotencyKey: crypto.randomUUID(),
      }),
    ).rejects.toMatchObject({ code: 'IMAGE_SIZE_EXCEEDED' });
    expect(current.upload).not.toHaveBeenCalled();
  });

  it('uploads without upsert before attaching metadata', async () => {
    const current = transport();
    const api = createProductImageApi(current);
    const result = await api.upload({
      productId,
      file: new File(['image'], 'ignored-name.jpg', { type: 'image/jpeg' }),
      sortOrder: 1,
      isPrimary: false,
      idempotencyKey: crypto.randomUUID(),
    });

    expect(result).toEqual({
      productImageId: imageId,
      objectPath: expect.stringMatching(
        new RegExp(`^products/${productId}/[0-9a-f-]+\\.jpg$`),
      ),
    });
    expect(current.upload).toHaveBeenCalledWith(
      result.objectPath,
      expect.any(File),
      { contentType: 'image/jpeg', upsert: false },
    );
    expect(vi.mocked(current.upload).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(current.attachMetadata).mock.invocationCallOrder[0] ?? 0,
    );
  });

  it('removes a newly uploaded object when metadata attachment fails', async () => {
    const current = transport({
      attachMetadata: vi
        .fn()
        .mockRejectedValue(new ProductImageApiError('IMAGE_LIMIT_EXCEEDED')),
    });
    const api = createProductImageApi(current);
    await expect(
      api.upload({
        productId,
        file: new File(['image'], 'x.png', { type: 'image/png' }),
        sortOrder: 0,
        isPrimary: true,
        idempotencyKey: crypto.randomUUID(),
      }),
    ).rejects.toMatchObject({ code: 'IMAGE_LIMIT_EXCEEDED' });
    expect(current.removeObjects).toHaveBeenCalledWith([
      expect.stringMatching(/\.png$/),
    ]);
  });

  it('detaches metadata first and returns a cleanup warning if object deletion fails', async () => {
    const current = transport({
      removeObjects: vi.fn().mockRejectedValue(new Error('raw storage detail')),
    });
    const api = createProductImageApi(current);
    await expect(
      api.remove({
        productImageId: imageId,
        idempotencyKey: crypto.randomUUID(),
      }),
    ).resolves.toEqual({
      cleanupWarning:
        'Ảnh đã được gỡ khỏi sản phẩm nhưng tệp lưu trữ chưa xóa được. Hệ thống có thể thử dọn dẹp lại.',
    });
    expect(
      vi.mocked(current.removeMetadata).mock.invocationCallOrder[0],
    ).toBeLessThan(
      vi.mocked(current.removeObjects).mock.invocationCallOrder[0] ?? 0,
    );
  });
});
