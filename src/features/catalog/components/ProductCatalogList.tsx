import { Link } from 'react-router';
import { formatViDecimal } from '@/shared/lib/numeric/canonical-number';
import { CatalogApiError } from '../api/catalog-api';
import type { ProductCatalogItem } from '../model/catalog-types';
import { scaledCatalogQuantity } from '../model/product-list';
import { ProductImageThumbnail } from './ProductImageThumbnail';

function stockStatus(item: ProductCatalogItem) {
  const onHand = scaledCatalogQuantity(item.onHandQty);
  const minimum = scaledCatalogQuantity(
    item.effectiveMinStockQty ?? item.minStockQty,
  );
  if (onHand <= 0n) return 'Hết hàng';
  if (onHand < minimum) return 'Sắp hết';
  return 'Còn hàng';
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
      className="catalog-product-row"
    >
      <ProductImageThumbnail
        objectPath={item.primaryImagePath}
        alt={`Ảnh chính của ${item.name}`}
        className="catalog-product-image"
      />
      <div className="catalog-product-info">
        <p className="catalog-product-name">{item.name}</p>
        <p className="catalog-product-sku">
          <span className="sr-only">SKU: </span>
          {item.sku}
        </p>
        {!item.isActive ? (
          <span className="catalog-inactive-label">Ngừng hoạt động</span>
        ) : null}
      </div>
      <div className="catalog-product-numbers">
        {canReadSalePrice ? (
          <p className="catalog-product-price">
            <span className="sr-only">Giá bán: </span>
            {item.currentSalePrice === null
              ? 'Chưa đặt giá'
              : formatViDecimal(item.currentSalePrice, 2)}
            {item.currentSalePrice !== null ? (
              <span className="sr-only"> đồng</span>
            ) : null}
          </p>
        ) : null}
        <p
          className="catalog-product-stock"
          title={`${formatViDecimal(item.onHandQty)} ${item.unitName}`}
        >
          Tồn: {formatViDecimal(item.onHandQty)}
          <span className="sr-only"> {item.unitName}</span>
        </p>
        <span
          className={
            status === 'Còn hàng'
              ? 'sr-only'
              : `catalog-stock-alert${status === 'Hết hàng' ? ' is-empty' : ''}`
          }
        >
          {status}
        </span>
      </div>
    </Link>
  );
}

function LoadingRows() {
  return (
    <div aria-live="polite" aria-busy="true">
      {Array.from({ length: 6 }, (_, index) => (
        <div
          key={index}
          aria-label="Đang tải sản phẩm"
          className="catalog-product-row motion-safe:animate-pulse"
        >
          <span className="catalog-product-image bg-slate-100" />
          <div className="space-y-3">
            <span className="block h-4 w-4/5 rounded bg-slate-100" />
            <span className="block h-3 w-1/2 rounded bg-slate-100" />
          </div>
          <div className="space-y-3">
            <span className="ml-auto block h-4 w-16 rounded bg-slate-100" />
            <span className="ml-auto block h-3 w-12 rounded bg-slate-100" />
          </div>
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
    <div className="catalog-product-list" aria-label="Danh sách hàng hóa">
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
          <button type="button" onClick={onRetry} className="catalog-next mt-4">
            Thử lại
          </button>
        </div>
      ) : null}
      {!isError && !isPending && items?.length === 0 ? (
        <div className="p-8 text-center">
          <p className="font-semibold text-slate-900">Chưa có sản phẩm.</p>
          <p className="mt-2 text-sm text-slate-600">
            Thay đổi bộ lọc hoặc thêm sản phẩm mới.
          </p>
          {canManage ? (
            <Link
              to="/products/new"
              className="mt-4 inline-flex min-h-11 items-center rounded-lg text-sm font-semibold text-blue-700 hover:underline"
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
