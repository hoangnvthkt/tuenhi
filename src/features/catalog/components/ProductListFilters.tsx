import { CaretDown, Funnel } from '@phosphor-icons/react';
import { useState, type FormEvent } from 'react';
import type { CategoryOption, CatalogStockState } from '../model/catalog-types';
import type { ProductListFilters as Filters } from '../model/product-list';

export function ProductListFilters({
  canManage,
  canReadSalePrice,
  categories,
  draft,
  searchOpen,
  showSalePrice,
  onShowSalePriceChange,
  onCategoryChange,
  onChange,
  onSubmit,
}: {
  canManage: boolean;
  canReadSalePrice: boolean;
  categories: CategoryOption[];
  draft: Filters;
  searchOpen: boolean;
  showSalePrice: boolean;
  onShowSalePriceChange: (show: boolean) => void;
  onCategoryChange: (categoryId: string) => void;
  onChange: (filters: Filters) => void;
  onSubmit: (event: FormEvent) => void;
}) {
  const [expanded, setExpanded] = useState(
    draft.stockState !== 'ALL' || draft.includeInactive,
  );
  const hasAdvancedFilters =
    draft.stockState !== 'ALL' || draft.includeInactive;
  return (
    <form onSubmit={onSubmit} className="catalog-filters">
      <div className="catalog-filter-bar">
        <button
          type="button"
          className={`catalog-filter-toggle${hasAdvancedFilters ? ' is-filtered' : ''}`}
          aria-label="Bộ lọc hàng hóa"
          aria-expanded={expanded}
          aria-controls="catalog-advanced-filters"
          onClick={() => setExpanded(!expanded)}
        >
          <Funnel size={21} aria-hidden="true" />
        </button>
        <div className="catalog-chip catalog-category-chip">
          <label htmlFor="product-category" className="sr-only">
            Nhóm hàng
          </label>
          <select
            id="product-category"
            value={draft.categoryId}
            onChange={(event) => onCategoryChange(event.target.value)}
          >
            <option value="">Tất cả loại hàng</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
                {category.isActive ? '' : ' (đã tắt)'}
              </option>
            ))}
          </select>
          <CaretDown size={14} weight="fill" aria-hidden="true" />
        </div>
        {canReadSalePrice ? (
          <div className="catalog-chip catalog-price-chip">
            <label htmlFor="product-price-display" className="sr-only">
              Hiển thị giá
            </label>
            <select
              id="product-price-display"
              value={showSalePrice ? 'price' : 'stock'}
              onChange={(event) =>
                onShowSalePriceChange(event.target.value === 'price')
              }
            >
              <option value="price">Giá bán</option>
              <option value="stock">Chỉ tồn kho</option>
            </select>
            <CaretDown size={14} weight="fill" aria-hidden="true" />
          </div>
        ) : null}
      </div>
      {searchOpen ? (
        <div id="catalog-search" className="catalog-search">
          <label htmlFor="product-search" className="sr-only">
            Tìm sản phẩm
          </label>
          <input
            id="product-search"
            autoFocus
            value={draft.search}
            onChange={(event) =>
              onChange({ ...draft, search: event.target.value })
            }
            placeholder="Tên, SKU hoặc mã vạch"
          />
          <button type="submit" className="catalog-submit">
            Tìm kiếm
          </button>
        </div>
      ) : null}
      {expanded ? (
        <div id="catalog-advanced-filters" className="catalog-advanced">
          <div>
            <label htmlFor="product-stock">Tình trạng tồn</label>
            <select
              id="product-stock"
              value={draft.stockState}
              onChange={(event) =>
                onChange({
                  ...draft,
                  stockState: event.target.value as CatalogStockState,
                })
              }
            >
              <option value="ALL">Tất cả</option>
              <option value="IN_STOCK">Còn hàng</option>
              <option value="LOW_STOCK">Sắp hết</option>
              <option value="OUT_OF_STOCK">Hết hàng</option>
            </select>
          </div>
          {canManage ? (
            <label className="catalog-inactive">
              <input
                type="checkbox"
                checked={draft.includeInactive}
                onChange={(event) =>
                  onChange({ ...draft, includeInactive: event.target.checked })
                }
              />
              <span>Gồm sản phẩm ngừng hoạt động</span>
            </label>
          ) : null}
          <button type="submit" className="catalog-submit">
            Áp dụng bộ lọc
          </button>
        </div>
      ) : null}
    </form>
  );
}
