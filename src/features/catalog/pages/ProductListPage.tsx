import { useQuery } from '@tanstack/react-query';
import { useMemo, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router';
import {
  ArrowsDownUp,
  DotsThree,
  MagnifyingGlass,
  Plus,
  X,
} from '@phosphor-icons/react';
import { useSession } from '@/features/auth';
import {
  catalogKeys,
  createCatalogApi,
  type CatalogApi,
} from '../api/catalog-api';
import type { CatalogCursor, CatalogStockState } from '../model/catalog-types';
import {
  formatPageStockTotal,
  type ProductListFilters as Filters,
} from '../model/product-list';
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
  const [searchOpen, setSearchOpen] = useState(Boolean(initialFilters.search));
  const [showSalePrice, setShowSalePrice] = useState(true);
  const [descending, setDescending] = useState(false);
  const canReadSalePrice =
    session?.permissions.includes('pricing.sale.read') ?? false;

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
    updateFilters(draft);
  }

  function updateFilters(values: Filters) {
    const next = {
      ...values,
      search: values.search.trim(),
      includeInactive: canManage && values.includeInactive,
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
  const items = useMemo(
    () =>
      query.data?.items.toSorted(
        (a, b) => a.name.localeCompare(b.name, 'vi') * (descending ? -1 : 1),
      ),
    [query.data, descending],
  );
  // Quantities come from the loaded page, never from a guessed catalog total.
  const totalStockText = items ? formatPageStockTotal(items) : null;
  return (
    <section className="product-catalog-page">
      <div className="catalog-top">
        <div className="catalog-heading">
          <h1>Hàng hóa</h1>
          <div className="catalog-actions">
            <button
              type="button"
              className="catalog-icon-button"
              aria-label={searchOpen ? 'Đóng tìm kiếm' : 'Mở tìm kiếm'}
              aria-expanded={searchOpen}
              aria-controls="catalog-search"
              onClick={() => {
                if (searchOpen) setDraft({ ...draft, search: filters.search });
                setSearchOpen(!searchOpen);
              }}
            >
              <MagnifyingGlass size={25} aria-hidden="true" />
            </button>
            <button
              type="button"
              className="catalog-icon-button"
              aria-label="Đảo thứ tự tên trên trang"
              title={
                descending ? 'Tên Z đến A trên trang' : 'Tên A đến Z trên trang'
              }
              aria-pressed={descending}
              onClick={() => setDescending(!descending)}
            >
              <ArrowsDownUp size={25} aria-hidden="true" />
            </button>
            {canManage ? (
              <details className="catalog-more">
                <summary
                  className="catalog-icon-button"
                  aria-label="Tùy chọn hàng hóa"
                >
                  <DotsThree size={28} weight="bold" aria-hidden="true" />
                </summary>
                <div className="catalog-menu">
                  <Link to="/products/categories">Quản lý nhóm hàng</Link>
                  <Link to="/products/new">Thêm sản phẩm</Link>
                </div>
              </details>
            ) : null}
          </div>
        </div>
        <ProductListFilters
          canManage={canManage}
          canReadSalePrice={canReadSalePrice}
          categories={categories.data ?? []}
          draft={draft}
          searchOpen={searchOpen}
          showSalePrice={showSalePrice}
          onShowSalePriceChange={setShowSalePrice}
          onCategoryChange={(categoryId) => {
            setDraft({ ...draft, categoryId });
            updateFilters({ ...filters, categoryId });
          }}
          onChange={setDraft}
          onSubmit={applyFilters}
        />
        {filters.search ? (
          <div className="catalog-active-search">
            <span>Đang tìm: {filters.search}</span>
            <button
              type="button"
              aria-label="Xóa tìm kiếm đang áp dụng"
              onClick={() => {
                setDraft({ ...draft, search: '' });
                updateFilters({ ...filters, search: '' });
              }}
            >
              <X size={16} aria-hidden="true" />
            </button>
          </div>
        ) : null}
        <div
          className="catalog-summary"
          role="region"
          aria-label="Tổng tồn trên trang này"
          aria-live="polite"
        >
          <div className="catalog-summary-total">
            <span>Tổng tồn</span>
            <strong>
              {query.isError ? 'Không có dữ liệu' : (totalStockText ?? '…')}
            </strong>
          </div>
          <p>
            {query.isPending
              ? 'Đang tải hàng hóa…'
              : query.isError
                ? 'Vui lòng thử tải lại'
                : `${items?.length ?? 0} hàng hóa trên trang này`}
          </p>
        </div>
      </div>

      <ProductCatalogList
        canReadSalePrice={canReadSalePrice && showSalePrice}
        canManage={canManage}
        error={error}
        isError={query.isError}
        isPending={query.isPending}
        items={items}
        onRetry={() => void query.refetch()}
      />

      {query.data?.nextCursor ? (
        <div className="catalog-pagination">
          <span>Còn hàng hóa ở trang tiếp theo</span>
          <button
            type="button"
            onClick={() => setCursor(query.data?.nextCursor ?? undefined)}
            className="catalog-next"
          >
            Trang tiếp
          </button>
        </div>
      ) : null}
      {canManage ? (
        <Link
          to="/products/new"
          className="catalog-add"
          aria-label="Thêm sản phẩm"
          title="Thêm sản phẩm"
        >
          <Plus size={32} aria-hidden="true" />
        </Link>
      ) : null}
    </section>
  );
}
