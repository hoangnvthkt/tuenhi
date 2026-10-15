import { usePrivateQueryKey } from '@/features/auth';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { createCatalogApi } from '../api/catalog-api';
import {
  createProductImageApi,
  type ProductImageApi,
} from '../api/product-image-api';

async function loadProductPrimaryImagePath(productId: string) {
  return (await createCatalogApi().detail(productId)).primaryImagePath;
}

function MissingImage({ className }: { className: string }) {
  return (
    <div
      aria-label="Chưa có ảnh"
      className={`grid place-items-center bg-slate-100 text-xs font-semibold text-slate-500 ${className}`}
    >
      Ảnh
    </div>
  );
}

export function ProductImageThumbnail({
  objectPath,
  alt,
  className = '',
  api: apiProp,
  productId,
  loadPrimaryImagePath = loadProductPrimaryImagePath,
}: {
  objectPath: string | null | undefined;
  alt: string;
  className?: string;
  api?: ProductImageApi;
  productId?: string;
  loadPrimaryImagePath?: (productId: string) => Promise<string | null>;
}) {
  const privateKey = usePrivateQueryKey();
  const [api] = useState(() => apiProp ?? createProductImageApi());
  const needsMetadata = objectPath === undefined && Boolean(productId);
  const metadata = useQuery({
    queryKey: privateKey('catalog', 'product-primary-image-path', productId),
    queryFn: () => loadPrimaryImagePath(productId!),
    enabled: needsMetadata,
    staleTime: 8 * 60 * 1000,
  });
  const resolvedPath = objectPath === undefined ? metadata.data : objectPath;
  const query = useQuery({
    queryKey: privateKey(...['catalog', 'product-image-url', resolvedPath]),
    queryFn: () => api.createSignedUrl(resolvedPath!),
    enabled: Boolean(resolvedPath),
    staleTime: 8 * 60 * 1000,
  });
  const baseClass = `aspect-square rounded-lg ${className}`;

  if (
    (needsMetadata && metadata.isPending) ||
    (resolvedPath && query.isPending)
  ) {
    return (
      <div
        aria-label="Đang tải ảnh sản phẩm"
        className={`animate-pulse bg-slate-200 ${baseClass}`}
      />
    );
  }
  if (!resolvedPath || query.isError || !query.data) {
    return <MissingImage className={baseClass} />;
  }
  return (
    <img
      src={query.data}
      alt={alt}
      className={`w-full object-cover ${baseClass}`}
    />
  );
}
