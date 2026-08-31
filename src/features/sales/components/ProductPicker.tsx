import { useRef, useState } from 'react';
import type { ProductCatalogItem } from '@/features/catalog';
import { formatViNumber } from '@/shared/lib/numeric/canonical-number';
import { formatPosMoney } from '../model/format-money';

export function ProductPicker({
  search,
  resolvedSearch,
  products,
  isLoading,
  onSearchChange,
  onExactLookup,
  onAdd,
}: {
  search: string;
  resolvedSearch: string;
  products: ProductCatalogItem[];
  isLoading: boolean;
  onSearchChange: (value: string) => void;
  onExactLookup: (search: string) => Promise<ProductCatalogItem[]>;
  onAdd: (product: ProductCatalogItem) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [highlightedIndex, setHighlightedIndex] = useState(0);

  const addAndReset = (product: ProductCatalogItem) => {
    if (!product.currentSalePrice) return;
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
    if (resolvedSearch.trim() !== value) {
      const fresh = await onExactLookup(value);
      const exact = exactMatches(fresh, value);
      if (exact.length === 1) addAndReset(exact[0]!);
      return;
    }
    const exact = exactMatches(products, value);
    if (exact.length === 1) {
      addAndReset(exact[0]!);
      return;
    }
    const highlighted =
      products[Math.min(highlightedIndex, products.length - 1)];
    if (highlighted) addAndReset(highlighted);
  };

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4">
      <label
        htmlFor="pos-product-search"
        className="mb-2 block text-sm font-medium"
      >
        Tìm sản phẩm
      </label>
      <input
        id="pos-product-search"
        ref={inputRef}
        autoFocus
        role="combobox"
        aria-autocomplete="list"
        aria-controls="pos-product-results"
        aria-expanded={products.length > 0}
        aria-activedescendant={
          products[highlightedIndex]
            ? `pos-product-${products[highlightedIndex]!.id}`
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
              products.length ? (current + 1) % products.length : 0,
            );
          } else if (event.key === 'ArrowUp') {
            event.preventDefault();
            setHighlightedIndex((current) =>
              products.length
                ? (current - 1 + products.length) % products.length
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
        placeholder="Tên hàng, SKU hoặc mã vạch rồi nhấn Enter"
        className="min-h-11 w-full rounded-lg border border-slate-300 px-3"
      />
      <p className="mt-2 hidden text-xs text-slate-500 sm:block">
        ↑↓ chọn · Enter thêm · Esc xóa · máy quét USB/Bluetooth dùng như bàn
        phím
      </p>
      <div
        id="pos-product-results"
        role="listbox"
        aria-label="Kết quả tìm sản phẩm"
        className="mt-4 grid gap-2 sm:grid-cols-2"
      >
        {products.map((product, index) => (
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
                ? 'border-teal-600 bg-teal-50'
                : 'border-slate-200 hover:border-teal-500'
            }`}
          >
            <p className="font-medium text-slate-950">{product.name}</p>
            <p className="text-xs text-slate-500">
              {product.sku} · Tồn {formatViNumber(product.onHandQty)}{' '}
              {product.unitName}
            </p>
            <p className="mt-1 text-sm font-semibold text-teal-800">
              {product.currentSalePrice
                ? formatPosMoney(product.currentSalePrice)
                : 'Chưa có giá'}
            </p>
          </button>
        ))}
      </div>
      {isLoading ? (
        <p className="mt-4 text-sm text-slate-500">Đang tìm hàng…</p>
      ) : null}
    </section>
  );
}
