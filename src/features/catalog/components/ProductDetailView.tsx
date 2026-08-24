import { Link } from 'react-router';
import { formatViNumber } from '@/shared/lib/numeric/canonical-number';
import type { PriceHistoryItem } from '../api/catalog-api';
import type { ProductDetail } from '../model/catalog-types';
import { ProductImageManager } from './ProductImageManager';

function formatMoney(value: string | null) {
  return value === null ? 'Chưa đặt giá' : `${formatViNumber(value)} ₫`;
}

export function ProductDetailView({
  canManage,
  canManageSalePrice,
  detail,
  isOnline,
  onImagesChanged,
  priceHistory,
  priceHistoryError,
  priceHistoryPending,
}: {
  canManage: boolean;
  canManageSalePrice: boolean;
  detail: ProductDetail;
  isOnline: boolean;
  onImagesChanged: () => Promise<void>;
  priceHistory: PriceHistoryItem[] | undefined;
  priceHistoryError: boolean;
  priceHistoryPending: boolean;
}) {
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
        onChanged={onImagesChanged}
      />

      {canManageSalePrice ? (
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-base font-bold text-slate-950">
            Lịch sử giá bán
          </h2>
          {priceHistoryPending ? (
            <p className="mt-3 text-sm text-slate-600">Đang tải lịch sử…</p>
          ) : null}
          {priceHistoryError ? (
            <p role="alert" className="mt-3 text-sm text-red-800">
              Không thể tải lịch sử giá bán.
            </p>
          ) : null}
          {priceHistory?.length === 0 ? (
            <p className="mt-3 text-sm text-slate-600">
              Chưa có lần thay đổi giá.
            </p>
          ) : null}
          <ul className="mt-3 divide-y divide-slate-200">
            {priceHistory?.map((entry) => (
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
