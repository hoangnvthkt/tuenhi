import { useQuery, useQueryClient } from '@tanstack/react-query';
import { refreshOperationalData } from '@/shared/api/refresh-operational-data';
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { useOnlineStatus } from '@/shared/hooks/use-online-status';
import { useToast } from '@/shared/ui/feedback/use-toast';
import { useSession } from '@/features/auth';
import {
  CatalogApiError,
  catalogKeys,
  createCatalogApi,
  type CatalogApi,
} from '../api/catalog-api';
import type { ProductSaveRequest } from '../components/ProductForm';
import { ProductDetailView } from '../components/ProductDetailView';
import { ProductEditor } from '../components/ProductEditor';

type ProductDetailMode = 'view' | 'create' | 'edit';

function LoadingDetail() {
  return (
    <div aria-label="Đang tải sản phẩm" className="space-y-4 animate-pulse">
      <div className="h-8 w-64 rounded bg-slate-200" />
      <div className="h-40 rounded-xl bg-slate-100" />
    </div>
  );
}

export function ProductDetailPage({
  api: apiProp,
  mode = 'view',
}: {
  api?: CatalogApi;
  mode?: ProductDetailMode;
}) {
  const [api] = useState(() => apiProp ?? createCatalogApi());
  const { productId } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const toast = useToast();
  const { session } = useSession();
  const isOnline = useOnlineStatus();
  const canManage =
    session?.permissions.includes('catalog.basic.manage') ?? false;
  const canManageSalePrice =
    session?.permissions.includes('pricing.sale.manage') ?? false;
  const needsDetail = mode !== 'create';

  const detailQuery = useQuery({
    queryKey: catalogKeys.detail(productId ?? 'missing'),
    queryFn: () => {
      if (!productId) throw new Error('Thiếu mã sản phẩm.');
      return api.detail(productId);
    },
    enabled: needsDetail && Boolean(productId),
  });
  const categoriesQuery = useQuery({
    queryKey: catalogKeys.categories(mode === 'edit'),
    queryFn: () => api.listCategories(mode === 'edit'),
    enabled: mode !== 'view',
  });
  const priceHistoryQuery = useQuery({
    queryKey: catalogKeys.priceHistory(productId ?? 'missing'),
    queryFn: () => {
      if (!productId) throw new Error('Thiếu mã sản phẩm.');
      return api.priceHistory(productId);
    },
    enabled: mode === 'view' && canManageSalePrice && Boolean(productId),
  });

  async function save(request: ProductSaveRequest) {
    const current = detailQuery.data;
    const { salePrice, ...productValues } = request.values;
    try {
      const result = await api.saveProduct({
        productId: mode === 'edit' ? productId : undefined,
        expectedVersion: mode === 'edit' ? current?.version : undefined,
        values: productValues,
        idempotencyKey: request.productIdempotencyKey,
      });

      const priceChanged =
        salePrice !== '' && salePrice !== current?.currentSalePrice;
      if (canManageSalePrice && priceChanged) {
        await api.setSalePrice({
          productId: result.productId,
          salePrice,
          changeReason:
            mode === 'create' ? 'Đặt giá bán ban đầu' : 'Cập nhật giá bán',
          idempotencyKey: request.priceIdempotencyKey,
        });
      }

      await refreshOperationalData(queryClient);
      toast.show({
        kind: 'success',
        title: mode === 'create' ? 'Đã thêm sản phẩm' : 'Đã cập nhật sản phẩm',
      });
      navigate(`/products/${result.productId}`);
    } catch (error) {
      if (mode === 'edit' && !(error instanceof CatalogApiError)) {
        await detailQuery.refetch();
      }
      throw error;
    }
  }

  if (mode !== 'create' && detailQuery.isPending) return <LoadingDetail />;
  if (mode !== 'view' && categoriesQuery.isPending) return <LoadingDetail />;

  if (mode !== 'create' && detailQuery.isError) {
    return (
      <div
        role="alert"
        className="rounded-xl border border-red-200 bg-red-50 p-6"
      >
        <h1 className="text-lg font-bold text-red-900">
          Không thể tải sản phẩm.
        </h1>
        <p className="mt-2 text-sm text-red-800">
          Vui lòng kiểm tra kết nối và thử lại.
        </p>
        {detailQuery.error instanceof CatalogApiError ? (
          <code className="mt-2 block text-xs text-red-700">
            {detailQuery.error.correlationId}
          </code>
        ) : null}
        <button
          type="button"
          onClick={() => void detailQuery.refetch()}
          className="mt-4 min-h-11 rounded-lg border border-red-300 px-4 text-sm font-semibold"
        >
          Thử lại
        </button>
      </div>
    );
  }

  if (mode !== 'view') {
    if (categoriesQuery.isError) {
      return (
        <div
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 p-6 text-red-900"
        >
          Không thể tải nhóm hàng. Vui lòng thử lại.
        </div>
      );
    }
    const detail = detailQuery.data;
    return (
      <ProductEditor
        canManageSalePrice={canManageSalePrice}
        categories={categoriesQuery.data ?? []}
        detail={detail}
        isOnline={isOnline}
        mode={mode}
        onSave={save}
      />
    );
  }

  const detail = detailQuery.data;
  if (!detail) return null;

  return (
    <ProductDetailView
      canManage={canManage}
      canManageSalePrice={canManageSalePrice}
      detail={detail}
      isOnline={isOnline}
      onImagesChanged={async () => {
        await detailQuery.refetch();
      }}
      priceHistory={priceHistoryQuery.data}
      priceHistoryError={priceHistoryQuery.isError}
      priceHistoryPending={priceHistoryQuery.isPending}
    />
  );
}
