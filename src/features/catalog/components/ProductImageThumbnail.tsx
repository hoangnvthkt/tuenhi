import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import {
  createProductImageApi,
  type ProductImageApi,
} from '../api/product-image-api';

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
}: {
  objectPath: string | null;
  alt: string;
  className?: string;
  api?: ProductImageApi;
}) {
  const [api] = useState(() => apiProp ?? createProductImageApi());
  const query = useQuery({
    queryKey: ['catalog', 'product-image-url', objectPath],
    queryFn: () => api.createSignedUrl(objectPath!),
    enabled: Boolean(objectPath),
    staleTime: 8 * 60 * 1000,
  });
  const baseClass = `aspect-square rounded-lg ${className}`;

  if (!objectPath) {
    return <MissingImage className={baseClass} />;
  }
  if (query.isPending) {
    return (
      <div
        aria-label="Đang tải ảnh sản phẩm"
        className={`animate-pulse bg-slate-200 ${baseClass}`}
      />
    );
  }
  if (query.isError || !query.data) {
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
