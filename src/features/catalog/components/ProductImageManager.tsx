import { useRef, useState, type FormEvent } from 'react';
import type { ProductDetail } from '../model/catalog-types';
import {
  createProductImageApi,
  ProductImageApiError,
  type ProductImageApi,
} from '../api/product-image-api';
import { ProductImageThumbnail } from './ProductImageThumbnail';

type ProductImage = ProductDetail['images'][number];

export function ProductImageManager({
  productId,
  images,
  canManage,
  isOnline,
  onChanged,
  api: apiProp,
}: {
  productId: string;
  images: ProductImage[];
  canManage: boolean;
  isOnline: boolean;
  onChanged: () => Promise<void>;
  api?: ProductImageApi;
}) {
  const [api] = useState(() => apiProp ?? createProductImageApi());
  const [file, setFile] = useState<File | null>(null);
  const [isPrimary, setIsPrimary] = useState(images.length === 0);
  const [working, setWorking] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [cleanupWarning, setCleanupWarning] = useState<string | null>(null);
  const uploadKey = useRef<string | null>(null);
  const removeKeys = useRef(new Map<string, string>());
  const atLimit = images.length >= 5;

  async function upload(event: FormEvent) {
    event.preventDefault();
    if (!file || !isOnline || atLimit || working) return;
    uploadKey.current ??= crypto.randomUUID();
    setWorking(true);
    setErrorMessage(null);
    setCleanupWarning(null);
    try {
      await api.upload({
        productId,
        file,
        sortOrder: images.length,
        isPrimary,
        idempotencyKey: uploadKey.current,
      });
      uploadKey.current = null;
      setFile(null);
      setIsPrimary(false);
      await onChanged();
    } catch (error) {
      setErrorMessage(
        error instanceof ProductImageApiError
          ? error.message
          : 'Không thể tải ảnh lên. Vui lòng thử lại.',
      );
    } finally {
      setWorking(false);
    }
  }

  async function remove(image: ProductImage) {
    if (!isOnline || working) return;
    if (!window.confirm('Xóa ảnh này khỏi sản phẩm?')) return;
    const idempotencyKey =
      removeKeys.current.get(image.id) ?? crypto.randomUUID();
    removeKeys.current.set(image.id, idempotencyKey);
    setWorking(true);
    setErrorMessage(null);
    setCleanupWarning(null);
    try {
      const result = await api.remove({
        productImageId: image.id,
        idempotencyKey,
      });
      removeKeys.current.delete(image.id);
      if (result.cleanupWarning) setCleanupWarning(result.cleanupWarning);
      await onChanged();
    } catch (error) {
      setErrorMessage(
        error instanceof ProductImageApiError
          ? error.message
          : 'Không thể gỡ ảnh khỏi sản phẩm. Vui lòng thử lại.',
      );
    } finally {
      setWorking(false);
    }
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-base font-bold text-slate-950">Ảnh sản phẩm</h2>
        <span className="text-xs tabular-nums text-slate-500">
          {images.length}/5 ảnh
        </span>
      </div>
      {images.length === 0 ? (
        <p className="mt-3 text-sm text-slate-600">Chưa có ảnh sản phẩm.</p>
      ) : (
        <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-5">
          {images.map((image) => (
            <li key={image.id} className="relative">
              <ProductImageThumbnail
                objectPath={image.objectPath}
                alt="Ảnh sản phẩm"
                api={api}
              />
              {image.isPrimary ? (
                <span className="absolute left-2 top-2 rounded bg-slate-950/80 px-2 py-1 text-xs font-semibold text-white">
                  Ảnh chính
                </span>
              ) : null}
              {canManage ? (
                <button
                  type="button"
                  aria-label="Xóa ảnh sản phẩm"
                  disabled={!isOnline || working}
                  onClick={() => void remove(image)}
                  className="mt-2 min-h-11 w-full rounded-lg border border-slate-300 px-3 text-sm font-semibold text-slate-800 disabled:opacity-50"
                >
                  Xóa ảnh
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {canManage ? (
        <form
          onSubmit={upload}
          className="mt-5 space-y-3 border-t border-slate-200 pt-5"
        >
          {atLimit ? (
            <p className="text-sm font-medium text-amber-900">
              Đã đạt tối đa 5 ảnh cho sản phẩm.
            </p>
          ) : (
            <div className="grid gap-3 md:grid-cols-[minmax(12rem,1fr)_auto_auto] md:items-end">
              <div>
                <label
                  htmlFor="product-image-file"
                  className="mb-2 block text-sm font-medium"
                >
                  Chọn ảnh sản phẩm
                </label>
                <input
                  id="product-image-file"
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  disabled={!isOnline || working}
                  onChange={(event) => {
                    setFile(event.target.files?.[0] ?? null);
                    uploadKey.current = null;
                    setErrorMessage(null);
                  }}
                  className="min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm file:mr-3 file:rounded file:border-0 file:bg-slate-100 file:px-3 file:py-1"
                />
              </div>
              <label className="flex min-h-11 items-center gap-2 text-sm font-medium">
                <input
                  type="checkbox"
                  checked={isPrimary}
                  onChange={(event) => setIsPrimary(event.target.checked)}
                  className="h-4 w-4 accent-teal-700"
                />
                Đặt làm ảnh chính
              </label>
              <button
                disabled={!isOnline || !file || working}
                className="min-h-11 rounded-lg bg-teal-700 px-4 text-sm font-semibold text-white disabled:opacity-50"
              >
                {working ? 'Đang xử lý…' : 'Tải ảnh lên'}
              </button>
            </div>
          )}
          {!isOnline ? (
            <p role="status" className="text-sm text-amber-900">
              Cần kết nối mạng để cập nhật ảnh sản phẩm.
            </p>
          ) : null}
        </form>
      ) : null}
      {errorMessage ? (
        <p
          role="alert"
          className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-800"
        >
          {errorMessage}
        </p>
      ) : null}
      {cleanupWarning ? (
        <p
          role="status"
          className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-900"
        >
          {cleanupWarning}
        </p>
      ) : null}
    </div>
  );
}
