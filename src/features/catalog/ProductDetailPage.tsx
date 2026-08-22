import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { useOnlineStatus } from '../../app/use-online-status';
import { useToast } from '../../components/feedback/use-toast';
import { formatViNumber } from '../../lib/numeric/canonical-number';
import { useSession } from '../auth/use-session';
import {
  CatalogApiError,
  catalogKeys,
  createCatalogApi,
  type CatalogApi,
} from './catalog-api';
import type { ProductDetail, ProductFormValues } from './catalog-types';
import { ProductForm, type ProductSaveRequest } from './ProductForm';
import { ProductImageManager } from './ProductImageManager';

type ProductDetailMode = 'view' | 'create' | 'edit';

function productFormValues(detail: ProductDetail): ProductFormValues {
  return {
    sku: detail.sku,
    barcode: detail.barcode ?? '',
    name: detail.name,
    categoryId: detail.categoryId ?? '',
    unitName: detail.unitName,
    description: detail.description ?? '',
    minStockQty: detail.minStockQty,
    salePrice: detail.currentSalePrice ?? '',
    isActive: detail.isActive,
  };
}

function formatMoney(value: string | null) {
  return value === null ? 'Chưa đặt giá' : `${formatViNumber(value)} ₫`;
}

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

      await queryClient.invalidateQueries({ queryKey: catalogKeys.all });
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
      <section className="space-y-5">
        <div>
          <Link
            to={detail ? `/products/${detail.id}` : '/products'}
            className="text-sm font-semibold text-teal-800 hover:underline"
          >
            ← {detail ? 'Về chi tiết sản phẩm' : 'Về danh sách sản phẩm'}
          </Link>
          <h1 className="mt-3 text-2xl font-bold tracking-tight text-slate-950">
            {mode === 'create' ? 'Thêm sản phẩm' : 'Sửa sản phẩm'}
          </h1>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <ProductForm
            key={detail?.version ?? 'new'}
            initialValues={detail ? productFormValues(detail) : undefined}
            categories={categoriesQuery.data ?? []}
            canManageSalePrice={canManageSalePrice}
            isOnline={isOnline}
            onSave={save}
          />
        </div>
      </section>
    );
  }

  const detail = detailQuery.data;
  if (!detail) return null;

  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link
            to="/products"
            className="text-sm font-semibold text-teal-800 hover:underline"
          >
            ← Về danh sách sản phẩm
          </Link>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight text-slate-950">
              {detail.name}
            </h1>
            {!detail.isActive ? (
              <span className="rounded-md bg-slate-200 px-2 py-1 text-xs font-semibold text-slate-700">
                Ngừng hoạt động
              </span>
            ) : null}
          </div>
          <p className="mt-1 font-mono text-sm text-slate-600">{detail.sku}</p>
        </div>
        {canManage ? (
          <Link
            to={`/products/${detail.id}/edit`}
            className="inline-flex min-h-11 items-center rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-900 hover:bg-slate-50"
          >
            Sửa sản phẩm
          </Link>
        ) : null}
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-base font-bold text-slate-950">
            Thông tin sản phẩm
          </h2>
          <dl className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Mã vạch
              </dt>
              <dd className="mt-1 text-sm text-slate-900">
                {detail.barcode ?? 'Chưa có'}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Nhóm hàng
              </dt>
              <dd className="mt-1 text-sm text-slate-900">
                {detail.categoryName ?? 'Chưa phân nhóm'}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Đơn vị tính
              </dt>
              <dd className="mt-1 text-sm text-slate-900">{detail.unitName}</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Ngưỡng tồn
              </dt>
              <dd className="mt-1 text-sm tabular-nums text-slate-900">
                {formatViNumber(detail.minStockQty)}
              </dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Mô tả
              </dt>
              <dd className="mt-1 whitespace-pre-wrap text-sm text-slate-900">
                {detail.description || 'Chưa có mô tả'}
              </dd>
            </div>
          </dl>
        </div>
        <aside className="space-y-4">
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Giá bán hiện hành
            </p>
            <p className="mt-2 text-xl font-bold tabular-nums text-slate-950">
              {formatMoney(detail.currentSalePrice)}
            </p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Tồn hiện tại
            </p>
            <p className="mt-2 text-xl font-bold tabular-nums text-slate-950">
              {formatViNumber(detail.onHandQty)} {detail.unitName}
            </p>
          </div>
        </aside>
      </div>

      <ProductImageManager
        productId={detail.id}
        images={detail.images}
        canManage={canManage}
        isOnline={isOnline}
        onChanged={async () => {
          await detailQuery.refetch();
        }}
      />

      {canManageSalePrice ? (
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-base font-bold text-slate-950">
            Lịch sử giá bán
          </h2>
          {priceHistoryQuery.isPending ? (
            <p className="mt-3 text-sm text-slate-600">Đang tải lịch sử…</p>
          ) : null}
          {priceHistoryQuery.isError ? (
            <p role="alert" className="mt-3 text-sm text-red-800">
              Không thể tải lịch sử giá bán.
            </p>
          ) : null}
          {priceHistoryQuery.data?.length === 0 ? (
            <p className="mt-3 text-sm text-slate-600">
              Chưa có lần thay đổi giá.
            </p>
          ) : null}
          <ul className="mt-3 divide-y divide-slate-200">
            {priceHistoryQuery.data?.map((entry) => (
              <li
                key={entry.id}
                className="flex flex-wrap justify-between gap-3 py-3 text-sm"
              >
                <span>
                  {new Intl.DateTimeFormat('vi-VN', {
                    dateStyle: 'medium',
                    timeStyle: 'short',
                  }).format(new Date(entry.validFrom))}
                </span>
                <strong className="tabular-nums">
                  {formatMoney(entry.salePrice)}
                </strong>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
