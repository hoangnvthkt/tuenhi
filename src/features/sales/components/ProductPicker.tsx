import { useRef, useState } from 'react';
import { Barcode, MagnifyingGlass, Plus } from '@phosphor-icons/react';
import type { ProductCatalogItem } from '@/features/catalog';
import { formatViDecimal } from '@/shared/lib/numeric/canonical-number';
import { formatPosMoney } from '../model/format-money';

export function ProductPicker({
  search,
  resolvedSearch,
  products,
  isLoading,
  onSearchChange,
  onExactLookup,
  onAdd,
  onCreate,
}: {
  search: string;
  resolvedSearch: string;
  products: ProductCatalogItem[];
  isLoading: boolean;
  onSearchChange: (value: string) => void;
  onExactLookup: (search: string) => Promise<ProductCatalogItem[]>;
  onAdd: (product: ProductCatalogItem) => void;
  onCreate?: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const [barcodeHint, setBarcodeHint] = useState(false);
  const hasSearch = Boolean(search.trim());
  const ready =
    hasSearch && search.trim() === resolvedSearch.trim() && !isLoading;
  const visibleProducts = ready ? products : [];

  const addAndReset = (product: ProductCatalogItem) => {
    if (
      !product.currentSalePrice ||
      !inputRef.current ||
      inputRef.current.matches(':disabled') ||
      inputRef.current.closest('[inert]')
    )
      return;
    onAdd(product);
    onSearchChange('');
    setHighlightedIndex(0);
    inputRef.current?.focus();
  };

  const exactMatches = (items: ProductCatalogItem[], value: string) => {
    const normalized = value.trim().toLocaleLowerCase('vi');
    return items.filter(
      (product) =>
        product.sku.trim().toLocaleLowerCase('vi') === normalized ||
        product.barcode?.trim().toLocaleLowerCase('vi') === normalized,
    );
  };

  const addFromEnter = async () => {
    const value = search.trim();
    if (!value) return;
    if (!ready || resolvedSearch.trim() !== value) {
      try {
        const fresh = await onExactLookup(value);
        const exact = exactMatches(fresh, value);
        if (exact.length === 1 && inputRef.current?.value.trim() === value)
          addAndReset(exact[0]!);
      } catch {
        // Keep the search intact so the user can retry after a safe API error.
      }
      return;
    }
    const exact = exactMatches(products, value);
    if (exact.length === 1) {
      addAndReset(exact[0]!);
      return;
    }
    if (exact.length > 1) return;
    const highlighted =
      products[Math.min(highlightedIndex, products.length - 1)];
    if (highlighted) addAndReset(highlighted);
  };

  return (
    <section className="pos-product-picker">
      <label htmlFor="pos-product-search" className="sr-only">
        Tìm sản phẩm
      </label>
      <div className="pos-search-row">
        <div className="pos-search-field">
          <MagnifyingGlass size={22} aria-hidden="true" />
          <input
            id="pos-product-search"
            ref={inputRef}
            autoComplete="off"
            role="combobox"
            aria-autocomplete="list"
            aria-controls={hasSearch ? 'pos-product-results' : undefined}
            aria-expanded={ready && visibleProducts.length > 0}
            aria-activedescendant={
              visibleProducts[highlightedIndex]
                ? `pos-product-${visibleProducts[highlightedIndex]!.id}`
                : undefined
            }
            value={search}
            onChange={(event) => {
              setHighlightedIndex(0);
              onSearchChange(event.target.value);
            }}
            onKeyDown={(event) => {
              if (event.nativeEvent.isComposing) return;
              if (event.key === 'ArrowDown') {
                event.preventDefault();
                setHighlightedIndex((current) =>
                  visibleProducts.length
                    ? (current + 1) % visibleProducts.length
                    : 0,
                );
              } else if (event.key === 'ArrowUp') {
                event.preventDefault();
                setHighlightedIndex((current) =>
                  visibleProducts.length
                    ? (current - 1 + visibleProducts.length) %
                      visibleProducts.length
                    : 0,
                );
              } else if (event.key === 'Enter') {
                event.preventDefault();
                void addFromEnter();
              } else if (event.key === 'Escape') {
                event.preventDefault();
                onSearchChange('');
                setHighlightedIndex(0);
              }
            }}
            placeholder="Tên, mã hàng, mã vạch…"
            className="min-h-12 min-w-0 w-full bg-transparent outline-none"
          />
        </div>
        {onCreate ? (
          <button
            type="button"
            className="pos-search-action"
            aria-label="Thêm hàng hóa"
            onClick={onCreate}
          >
            <Plus size={24} />
          </button>
        ) : null}
        <button
          type="button"
          className="pos-search-action"
          aria-label="Nhập mã vạch"
          onClick={() => {
            setBarcodeHint((current) => !current);
            inputRef.current?.focus();
          }}
        >
          <Barcode size={24} />
        </button>
      </div>
      {barcodeHint ? (
        <p role="status" className="px-4 pb-2 text-xs text-slate-600">
          Gõ mã vạch hoặc dùng máy quét USB/Bluetooth rồi nhấn Enter.
        </p>
      ) : null}
      <p className="sr-only">
        ↑↓ chọn · Enter thêm · Esc xóa · máy quét USB/Bluetooth dùng như bàn
        phím
      </p>
      {hasSearch ? (
        <div
          id="pos-product-results"
          role="listbox"
          aria-label="Kết quả tìm sản phẩm"
          className="pos-product-results"
        >
          {visibleProducts.map((product, index) => (
            <button
              key={product.id}
              id={`pos-product-${product.id}`}
              role="option"
              aria-selected={index === highlightedIndex}
              type="button"
              onMouseEnter={() => setHighlightedIndex(index)}
              onClick={() => addAndReset(product)}
              disabled={!product.currentSalePrice}
              className={`rounded-lg border p-3 text-left disabled:cursor-not-allowed disabled:bg-slate-50 ${
                index === highlightedIndex
                  ? 'border-blue-500 bg-blue-50'
                  : 'border-slate-200 hover:border-blue-500'
              }`}
            >
              <p className="font-medium text-slate-950">{product.name}</p>
              <p className="text-xs text-slate-500">
                {product.sku} · Tồn {formatViDecimal(product.onHandQty)}{' '}
                {product.unitName}
              </p>
              <p className="mt-1 text-sm font-semibold text-blue-600">
                {product.currentSalePrice
                  ? formatPosMoney(product.currentSalePrice)
                  : 'Chưa có giá'}
              </p>
            </button>
          ))}
          {ready && !products.length ? (
            <p className="p-3 text-sm text-slate-500">
              Không tìm thấy hàng hóa.
            </p>
          ) : null}
        </div>
      ) : null}
      {hasSearch && (!ready || isLoading) ? (
        <p className="mt-4 text-sm text-slate-500">Đang tìm hàng…</p>
      ) : null}
    </section>
  );
}
