import { z } from 'zod';
import { getSupabaseClient } from '../../lib/supabase/client';
import { CatalogApiError, parseMutationEnvelope } from './catalog-api';

const BUCKET = 'product-images';
const MAX_IMAGE_SIZE = 5 * 1024 * 1024;
const extensions = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
} as const;

const attachedSchema = z.object({ productImageId: z.uuid() });
const removedSchema = z.object({
  productImageId: z.uuid(),
  objectPath: z.string().min(1).max(500),
});

const imageMessages: Record<string, string> = {
  IMAGE_TYPE_INVALID: 'Chỉ chấp nhận ảnh JPEG, PNG hoặc WebP.',
  IMAGE_SIZE_EXCEEDED: 'Ảnh không được lớn hơn 5 MiB.',
  IMAGE_LIMIT_EXCEEDED: 'Mỗi sản phẩm chỉ được lưu tối đa 5 ảnh.',
  IMAGE_UPLOAD_FAILED: 'Không thể tải ảnh lên. Vui lòng thử lại.',
  IMAGE_METADATA_FAILED:
    'Không thể liên kết ảnh với sản phẩm. Tệp vừa tải đã được dọn dẹp.',
  IMAGE_REMOVE_FAILED: 'Không thể gỡ ảnh khỏi sản phẩm. Vui lòng thử lại.',
  IMAGE_URL_FAILED: 'Không thể mở ảnh sản phẩm. Vui lòng thử lại.',
};

export class ProductImageApiError extends Error {
  constructor(
    readonly code: string,
    readonly correlationId?: string,
  ) {
    super(
      imageMessages[code] ??
        'Không thể hoàn tất thao tác ảnh. Vui lòng thử lại.',
    );
    this.name = 'ProductImageApiError';
  }
}

export interface ProductImageTransport {
  upload(
    objectPath: string,
    file: File,
    options: { contentType: string; upsert: false },
  ): Promise<void>;
  removeObjects(objectPaths: string[]): Promise<void>;
  attachMetadata(input: {
    productId: string;
    objectPath: string;
    sortOrder: number;
    isPrimary: boolean;
    idempotencyKey: string;
  }): Promise<{ productImageId: string }>;
  removeMetadata(input: {
    productImageId: string;
    idempotencyKey: string;
  }): Promise<{ productImageId: string; objectPath: string }>;
  createSignedUrl(objectPath: string): Promise<string>;
}

export interface ProductImageApi {
  upload(input: {
    productId: string;
    file: File;
    sortOrder: number;
    isPrimary: boolean;
    idempotencyKey: string;
  }): Promise<{ productImageId: string; objectPath: string }>;
  remove(input: {
    productImageId: string;
    idempotencyKey: string;
  }): Promise<{ cleanupWarning?: string }>;
  createSignedUrl(objectPath: string): Promise<string>;
}

function safeImageError(error: unknown, fallback: string) {
  if (error instanceof ProductImageApiError) return error;
  if (error instanceof CatalogApiError) {
    return new ProductImageApiError(error.code, error.correlationId);
  }
  return new ProductImageApiError(fallback);
}

function createSupabaseTransport(): ProductImageTransport {
  const client = getSupabaseClient();
  const bucket = client.storage.from(BUCKET);
  return {
    async upload(objectPath, file, options) {
      const { error } = await bucket.upload(objectPath, file, options);
      if (error) throw new Error('storage upload failed');
    },
    async removeObjects(objectPaths) {
      const { error } = await bucket.remove(objectPaths);
      if (error) throw new Error('storage removal failed');
    },
    async attachMetadata(input) {
      const { data, error } = await client.rpc('attach_product_image', {
        p_product_id: input.productId,
        p_object_path: input.objectPath,
        p_sort_order: input.sortOrder,
        p_is_primary: input.isPrimary,
        p_idempotency_key: input.idempotencyKey,
      });
      if (error) throw new Error('metadata transport failed');
      return attachedSchema.parse(parseMutationEnvelope(data));
    },
    async removeMetadata(input) {
      const { data, error } = await client.rpc('remove_product_image', {
        p_product_image_id: input.productImageId,
        p_idempotency_key: input.idempotencyKey,
      });
      if (error) throw new Error('metadata transport failed');
      return removedSchema.parse(parseMutationEnvelope(data));
    },
    async createSignedUrl(objectPath) {
      const { data, error } = await bucket.createSignedUrl(objectPath, 60 * 10);
      if (error || !data.signedUrl) throw new Error('signed URL failed');
      return data.signedUrl;
    },
  };
}

export function createProductImageApi(
  transportProp?: ProductImageTransport,
): ProductImageApi {
  let transport = transportProp;
  function getTransport() {
    transport ??= createSupabaseTransport();
    return transport;
  }
  return {
    async upload(input) {
      const extension = extensions[input.file.type as keyof typeof extensions];
      if (!extension) throw new ProductImageApiError('IMAGE_TYPE_INVALID');
      if (input.file.size > MAX_IMAGE_SIZE) {
        throw new ProductImageApiError('IMAGE_SIZE_EXCEEDED');
      }
      const objectPath = `products/${input.productId}/${crypto.randomUUID()}.${extension}`;
      try {
        await getTransport().upload(objectPath, input.file, {
          contentType: input.file.type,
          upsert: false,
        });
      } catch {
        throw new ProductImageApiError('IMAGE_UPLOAD_FAILED');
      }

      try {
        const result = await getTransport().attachMetadata({
          productId: input.productId,
          objectPath,
          sortOrder: input.sortOrder,
          isPrimary: input.isPrimary,
          idempotencyKey: input.idempotencyKey,
        });
        return { ...result, objectPath };
      } catch (error) {
        try {
          await getTransport().removeObjects([objectPath]);
        } catch {
          // The original metadata error remains authoritative. A later cleanup
          // pass may remove an object that was never attached to a product.
        }
        throw safeImageError(error, 'IMAGE_METADATA_FAILED');
      }
    },

    async remove(input) {
      let result: { productImageId: string; objectPath: string };
      try {
        result = await getTransport().removeMetadata(input);
      } catch (error) {
        throw safeImageError(error, 'IMAGE_REMOVE_FAILED');
      }
      try {
        await getTransport().removeObjects([result.objectPath]);
        return {};
      } catch {
        return {
          cleanupWarning:
            'Ảnh đã được gỡ khỏi sản phẩm nhưng tệp lưu trữ chưa xóa được. Hệ thống có thể thử dọn dẹp lại.',
        };
      }
    },

    async createSignedUrl(objectPath) {
      try {
        return await getTransport().createSignedUrl(objectPath);
      } catch {
        throw new ProductImageApiError('IMAGE_URL_FAILED');
      }
    },
  };
}
