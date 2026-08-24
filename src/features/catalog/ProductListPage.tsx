import { useQuery } from '@tanstack/react-query';
import { useMemo, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router';
import { formatViNumber } from '@/shared/lib/numeric/canonical-number';
import { useSession } from '@/features/auth';
import {
  CatalogApiError,
  catalogKeys,
  createCatalogApi,
  type CatalogApi,
} from './catalog-api';
import type {
  CatalogCursor,
  CatalogStockState,
  ProductCatalogItem,
} from './catalog-types';

type Filters = {
  search: string;
  categoryId: string;
  stockState: CatalogStockState;
  includeInactive: boolean;
};

function formatMoney(value: string | null) {
  return value === null ? 'Chưa đặt giá' : `${formatViNumber(value)} ₫`;
}

function scaledQuantity(value: string) {
  const [integer = '0', fraction = ''] = value.split('.');
  return BigInt(`${integer}${fraction.padEnd(3, '0').slice(0, 3)}`);
}

function stockStatus(item: ProductCatalogItem) {
  const onHand = scaledQuantity(item.onHandQty);
  const minimum = scaledQuantity(item.minStockQty);
  if (onHand === 0n) {
    return { label: 'Hết hàng', className: 'bg-red-50 text-red-800' };
  }
  if (onHand <= minimum) {
    return { label: 'Sắp hết', className: 'bg-amber-50 text-amber-900' };
  }
  return { label: 'Còn hàng', className: 'bg-emerald-50 text-emerald-800' };
}

function ProductRow({ item }: { item: ProductCatalogItem }) {
  const status = stockStatus(item);
  return (
    <Link
      to={`/products/${item.id}`}
      data-testid={`product-row-${item.id}`}
      className="grid min-h-20 gap-3 border-b border-slate-200 px-3 py-3 transition-colors hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-teal-700 md:grid-cols-[3rem_minmax(13rem,1.7fr)_minmax(8rem,1fr)_9rem_8rem] md:items-center"
    >
      <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-slate-100 text-xs font-semibold text-slate-500">
        Ảnh
      </div>
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
      <p className="text-sm font-semibold tabular-nums text-slate-900 md:text-right">
        {formatMoney(item.currentSalePrice)}
      </p>
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

export function ProductListPage({ api: apiProp }: { api?: CatalogApi }) {
  const [api] = useState(() => apiProp ?? createCatalogApi());
  const { session } = useSession();
  const canManage =
    session?.permissions.includes('catalog.basic.manage') ?? false;
  const [searchParams, setSearchParams] = useSearchParams();
  const initialFilters = useMemo<Filters>(
    () => ({
      search: searchParams.get('q') ?? '',
      categoryId: searchParams.get('category') ?? '',
      stockState:
        (searchParams.get('stock') as CatalogStockState | null) ?? 'ALL',
      includeInactive: canManage && searchParams.get('inactive') === 'true',
    }),
    [canManage, searchParams],
  );
  const [draft, setDraft] = useState(initialFilters);
  const [filters, setFilters] = useState(initialFilters);
  const [cursor, setCursor] = useState<CatalogCursor | undefined>();

  const categories = useQuery({
    queryKey: catalogKeys.categories(canManage),
    queryFn: () => api.listCategories(canManage),
  });
  const query = useQuery({
    queryKey: catalogKeys.list({ ...filters, cursor }),
    queryFn: () =>
      api.list({
        search: filters.search,
        categoryId: filters.categoryId,
        stockState: filters.stockState,
        includeInactive: filters.includeInactive,
        cursor,
        limit: 30,
      }),
  });

  function applyFilters(event: FormEvent) {
    event.preventDefault();
    const next = {
      ...draft,
      search: draft.search.trim(),
      includeInactive: canManage && draft.includeInactive,
    };
    setCursor(undefined);
    setFilters(next);
    setSearchParams((params) => {
      const updated = new URLSearchParams(params);
      const entries: Array<[string, string]> = [
        ['q', next.search],
        ['category', next.categoryId],
        ['stock', next.stockState === 'ALL' ? '' : next.stockState],
        ['inactive', next.includeInactive ? 'true' : ''],
      ];
      for (const [key, value] of entries) {
        if (value) updated.set(key, value);
        else updated.delete(key);
      }
      return updated;
    });
  }

  const error = query.error;
  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-950">
            Hàng hóa
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Tra cứu sản phẩm, giá bán hiện hành và số lượng tồn.
          </p>
        </div>
        {canManage ? (
          <div className="flex flex-wrap items-center gap-3">
            <Link
              to="/products/categories"
              className="inline-flex min-h-11 items-center rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-900 hover:bg-slate-50"
            >
              Quản lý nhóm hàng
            </Link>
            <Link
              to="/products/new"
              className="inline-flex min-h-11 items-center rounded-lg bg-teal-700 px-4 text-sm font-semibold text-white hover:bg-teal-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700"
            >
              Thêm sản phẩm
            </Link>
          </div>
        ) : null}
      </div>

      <form
        onSubmit={applyFilters}
        className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm lg:grid-cols-[minmax(14rem,1fr)_13rem_12rem_auto] lg:items-end"
      >
        <div>
          <label
            htmlFor="product-search"
            className="mb-2 block text-sm font-medium"
          >
            Tìm sản phẩm
          </label>
          <input
            id="product-search"
            value={draft.search}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                search: event.target.value,
              }))
            }
            placeholder="Tên, SKU hoặc mã vạch"
            className="min-h-11 w-full rounded-lg border border-slate-300 px-3 outline-none focus:border-teal-700 focus:ring-2 focus:ring-teal-700/15"
          />
        </div>
        <div>
          <label
            htmlFor="product-category"
            className="mb-2 block text-sm font-medium"
          >
            Nhóm hàng
          </label>
          <select
            id="product-category"
            value={draft.categoryId}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                categoryId: event.target.value,
              }))
            }
            className="min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3"
          >
            <option value="">Tất cả nhóm</option>
            {(categories.data ?? []).map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
                {category.isActive ? '' : ' (đã tắt)'}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label
            htmlFor="product-stock"
            className="mb-2 block text-sm font-medium"
          >
            Tình trạng tồn
          </label>
          <select
            id="product-stock"
            value={draft.stockState}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                stockState: event.target.value as CatalogStockState,
              }))
            }
            className="min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3"
          >
            <option value="ALL">Tất cả</option>
            <option value="IN_STOCK">Còn hàng</option>
            <option value="LOW_STOCK">Sắp hết</option>
            <option value="OUT_OF_STOCK">Hết hàng</option>
          </select>
        </div>
        <button className="min-h-11 rounded-lg bg-slate-900 px-4 text-sm font-semibold text-white hover:bg-slate-800">
          Tìm kiếm
        </button>
        {canManage ? (
          <label className="flex min-h-11 items-center gap-3 text-sm text-slate-700 lg:col-span-4">
            <input
              type="checkbox"
              checked={draft.includeInactive}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  includeInactive: event.target.checked,
                }))
              }
              className="h-4 w-4 accent-teal-700"
            />
            <span>Gồm sản phẩm ngừng hoạt động</span>
          </label>
        ) : null}
      </form>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="hidden grid-cols-[3rem_minmax(13rem,1.7fr)_minmax(8rem,1fr)_9rem_8rem] gap-3 border-b border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500 md:grid">
          <span />
          <span>Sản phẩm</span>
          <span className="text-right">Giá bán</span>
          <span className="text-right">Tồn</span>
          <span className="text-right">Trạng thái</span>
        </div>
        {query.isPending ? <LoadingRows /> : null}
        {query.isError ? (
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
              onClick={() => void query.refetch()}
              className="mt-4 min-h-11 rounded-lg border border-slate-300 px-4 text-sm font-semibold hover:bg-slate-50"
            >
              Thử lại
            </button>
          </div>
        ) : null}
        {query.data?.items.length === 0 ? (
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
        {query.data?.items.map((item) => (
          <ProductRow key={item.id} item={item} />
        ))}
      </div>

      {query.data?.nextCursor ? (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => setCursor(query.data?.nextCursor ?? undefined)}
            className="min-h-11 rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-800 hover:bg-slate-50"
          >
            Trang tiếp
          </button>
        </div>
      ) : null}
    </section>
  );
}
