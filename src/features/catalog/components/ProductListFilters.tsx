import type { FormEvent } from 'react';
import type { CategoryOption, CatalogStockState } from '../model/catalog-types';
import type { ProductListFilters as Filters } from '../model/product-list';

export function ProductListFilters({
  canManage,
  categories,
  draft,
  onChange,
  onSubmit,
}: {
  canManage: boolean;
  categories: CategoryOption[];
  draft: Filters;
  onChange: (filters: Filters) => void;
  onSubmit: (event: FormEvent) => void;
}) {
  return (
    <form
      onSubmit={onSubmit}
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
            onChange({ ...draft, search: event.target.value })
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
            onChange({ ...draft, categoryId: event.target.value })
          }
          className="min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3"
        >
          <option value="">Tất cả nhóm</option>
          {categories.map((category) => (
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
            onChange({
              ...draft,
              stockState: event.target.value as CatalogStockState,
            })
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
              onChange({ ...draft, includeInactive: event.target.checked })
            }
            className="h-4 w-4 accent-teal-700"
          />
          <span>Gồm sản phẩm ngừng hoạt động</span>
        </label>
      ) : null}
    </form>
  );
}
