import { useQuery } from '@tanstack/react-query';
import { useMemo, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router';
import { useSession } from '@/features/auth';
import {
  catalogKeys,
  createCatalogApi,
  type CatalogApi,
} from '../api/catalog-api';
import type { CatalogCursor, CatalogStockState } from '../model/catalog-types';
import type { ProductListFilters as Filters } from '../model/product-list';
import { ProductCatalogList } from '../components/ProductCatalogList';
import { ProductListFilters } from '../components/ProductListFilters';

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

      <ProductListFilters
        canManage={canManage}
        categories={categories.data ?? []}
        draft={draft}
        onChange={setDraft}
        onSubmit={applyFilters}
      />

      <ProductCatalogList
        canReadSalePrice={
          session?.permissions.includes('pricing.sale.read') ?? false
        }
        canManage={canManage}
        error={error}
        isError={query.isError}
        isPending={query.isPending}
        items={query.data?.items}
        onRetry={() => void query.refetch()}
      />

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
