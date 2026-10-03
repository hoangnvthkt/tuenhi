import { Link } from 'react-router';
import { formatViNumber } from '@/shared/lib/numeric/canonical-number';
import { CatalogApiError } from '../api/catalog-api';
import type { ProductCatalogItem } from '../model/catalog-types';
import { ProductImageThumbnail } from './ProductImageThumbnail';

function formatMoney(value: string | null) {
  return value === null ? 'Chưa đặt giá' : `${formatViNumber(value)} ₫`;
}

function scaledQuantity(value: string) {
  const [integer = '0', fraction = ''] = value.split('.');
  return BigInt(`${integer}${fraction.padEnd(3, '0').slice(0, 3)}`);
}

function stockStatus(item: ProductCatalogItem) {
  const onHand = scaledQuantity(item.onHandQty);
  const minimum = scaledQuantity(item.effectiveMinStockQty ?? item.minStockQty);
  if (onHand === 0n) {
    return { label: 'Hết hàng', className: 'bg-red-50 text-red-800' };
  }
  if (onHand < minimum) {
    return { label: 'Sắp hết', className: 'bg-amber-50 text-amber-900' };
  }
  return { label: 'Còn hàng', className: 'bg-emerald-50 text-emerald-800' };
}

function ProductRow({
  item,
  canReadSalePrice,
}: {
  item: ProductCatalogItem;
  canReadSalePrice: boolean;
}) {
  const status = stockStatus(item);
  return (
    <Link
      to={`/products/${item.id}`}
      data-testid={`product-row-${item.id}`}
      className={`grid min-h-20 gap-3 border-b border-slate-200 px-3 py-3 transition-colors hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-teal-700 ${canReadSalePrice ? 'md:grid-cols-[3rem_minmax(13rem,1.7fr)_minmax(8rem,1fr)_9rem_8rem]' : 'md:grid-cols-[3rem_minmax(13rem,1.7fr)_9rem_8rem]'} md:items-center`}
    >
      <ProductImageThumbnail
        objectPath={item.primaryImagePath}
        alt={`Ảnh chính của ${item.name}`}
        className="h-12 w-12"
      />
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <p className="truncate text-sm font-semibold text-slate-950">
            {item.name}
          </p>
          {!item.isActive ? (
            <span className="rounded-md bg-slate-200 px-2 py-1 text-xs font-medium text-slate-700">
              Ngừng hoạt động
            </span>
          ) : null}
        </div>
        <p className="mt-1 text-xs text-slate-600">
          SKU: <span className="font-mono">{item.sku}</span>
          {item.categoryName ? ` · ${item.categoryName}` : ''}
        </p>
      </div>
      {canReadSalePrice ? (
        <p className="text-sm font-semibold tabular-nums text-slate-900 md:text-right">
          {formatMoney(item.currentSalePrice)}
        </p>
      ) : null}
      <p className="text-sm tabular-nums text-slate-700 md:text-right">
        {formatViNumber(item.onHandQty)} {item.unitName}
      </p>
      <div className="md:text-right">
        <span
          className={`inline-flex rounded-md px-2 py-1 text-xs font-semibold ${status.className}`}
        >
          {status.label}
        </span>
      </div>
    </Link>
  );
}

function LoadingRows() {
  return (
    <div className="divide-y divide-slate-200" aria-live="polite">
      {Array.from({ length: 6 }, (_, index) => (
        <div
          key={index}
          aria-label="Đang tải sản phẩm"
          className="grid min-h-20 animate-pulse grid-cols-[3rem_1fr] items-center gap-3 px-3 py-3 md:grid-cols-[3rem_minmax(13rem,1.7fr)_minmax(8rem,1fr)_9rem_8rem]"
        >
          <span className="h-12 w-12 rounded-lg bg-slate-200" />
          <span className="h-4 w-2/3 rounded bg-slate-200" />
          <span className="hidden h-4 rounded bg-slate-200 md:block" />
          <span className="hidden h-4 rounded bg-slate-200 md:block" />
          <span className="hidden h-6 rounded bg-slate-200 md:block" />
        </div>
      ))}
    </div>
  );
}

export function ProductCatalogList({
  canManage,
  canReadSalePrice,
  error,
  isError,
  isPending,
  items,
  onRetry,
}: {
  canManage: boolean;
  canReadSalePrice: boolean;
  error: unknown;
  isError: boolean;
  isPending: boolean;
  items: ProductCatalogItem[] | undefined;
  onRetry: () => void;
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div
        className={`hidden ${canReadSalePrice ? 'grid-cols-[3rem_minmax(13rem,1.7fr)_minmax(8rem,1fr)_9rem_8rem]' : 'grid-cols-[3rem_minmax(13rem,1.7fr)_9rem_8rem]'} gap-3 border-b border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500 md:grid`}
      >
        <span />
        <span>Sản phẩm</span>
        {canReadSalePrice ? <span className="text-right">Giá bán</span> : null}
        <span className="text-right">Tồn</span>
        <span className="text-right">Trạng thái</span>
      </div>
      {isPending ? <LoadingRows /> : null}
      {isError ? (
        <div role="alert" className="p-6 text-center">
          <p className="font-semibold text-red-800">
            Không thể tải danh mục sản phẩm.
          </p>
          <p className="mt-2 text-sm text-slate-600">
            Vui lòng kiểm tra kết nối và thử lại.
          </p>
          {error instanceof CatalogApiError ? (
            <code className="mt-2 block text-xs text-slate-500">
              {error.correlationId}
            </code>
          ) : null}
          <button
            type="button"
            onClick={onRetry}
            className="mt-4 min-h-11 rounded-lg border border-slate-300 px-4 text-sm font-semibold hover:bg-slate-50"
          >
            Thử lại
          </button>
        </div>
      ) : null}
      {items?.length === 0 ? (
        <div className="p-8 text-center">
          <p className="font-semibold text-slate-900">Chưa có sản phẩm.</p>
          <p className="mt-2 text-sm text-slate-600">
            Thay đổi bộ lọc hoặc thêm sản phẩm mới.
          </p>
          {canManage ? (
            <Link
              to="/products/new"
              className="mt-4 inline-flex min-h-11 items-center rounded-lg text-sm font-semibold text-teal-800 hover:underline"
            >
              Thêm sản phẩm đầu tiên
            </Link>
          ) : null}
        </div>
      ) : null}
      {items?.map((item) => (
        <ProductRow
          key={item.id}
          item={item}
          canReadSalePrice={canReadSalePrice}
        />
      ))}
    </div>
  );
}
