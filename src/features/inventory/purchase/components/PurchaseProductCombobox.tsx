import { useEffect, useMemo, useRef, useState } from 'react';

type PurchaseProductOption = {
  id: string;
  sku: string;
  barcode: string | null;
  name: string;
  unitName: string;
  isActive: boolean;
};

export function PurchaseProductCombobox({
  label,
  products,
  selectedProductId,
  selectedProductIds,
  disabled = false,
  onSelect,
  onSearch,
}: {
  label: string;
  products: PurchaseProductOption[];
  selectedProductId: string;
  selectedProductIds: Set<string>;
  disabled?: boolean;
  onSelect: (productId: string) => void;
  onSearch?: (query: string) => Promise<PurchaseProductOption[]>;
}) {
  const [query, setQuery] = useState('');
  const [remoteProducts, setRemoteProducts] = useState<
    PurchaseProductOption[] | null
  >(null);
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const latestSearch = useRef(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const normalizedQuery = query.trim().toLocaleLowerCase('vi-VN');
  const searchedProducts = remoteProducts ?? products;
  const matches = useMemo(
    () =>
      normalizedQuery
        ? searchedProducts.filter(
            (product) =>
              product.isActive &&
              (product.id === selectedProductId ||
                !selectedProductIds.has(product.id)) &&
              [product.sku, product.name, product.barcode ?? ''].some((value) =>
                value.toLocaleLowerCase('vi-VN').includes(normalizedQuery),
              ),
          )
        : [],
    [normalizedQuery, searchedProducts, selectedProductId, selectedProductIds],
  );
  const selectedProduct = products.find(
    (product) => product.id === selectedProductId,
  );
  const listId = `${label.replace(/[^a-z0-9]/gi, '-').toLowerCase()}-options`;

  useEffect(() => {
    if (!onSearch || !query.trim()) return;
    const searchId = latestSearch.current + 1;
    latestSearch.current = searchId;
    const timer = window.setTimeout(() => {
      void onSearch(query.trim())
        .then((results) => {
          if (latestSearch.current === searchId) {
            setActiveIndex(0);
            setRemoteProducts(results);
          }
        })
        .catch(() => {
          if (latestSearch.current === searchId) {
            setActiveIndex(0);
            setRemoteProducts([]);
          }
        });
    }, 250);
    return () => window.clearTimeout(timer);
  }, [onSearch, query]);

  useEffect(() => {
    function closeOnOutsideClick(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setIsOpen(false);
    }
    document.addEventListener('pointerdown', closeOnOutsideClick);
    return () =>
      document.removeEventListener('pointerdown', closeOnOutsideClick);
  }, []);

  function choose(productId: string) {
    onSelect(productId);
    setQuery('');
    setRemoteProducts(null);
    setIsOpen(false);
  }

  return (
    <div ref={rootRef}>
      <label className="text-sm font-semibold">
        {label}
        <input
          aria-controls={listId}
          aria-expanded={isOpen && matches.length > 0}
          aria-label={label}
          autoComplete="off"
          disabled={disabled}
          onChange={(event) => {
            setQuery(event.target.value);
            setRemoteProducts(null);
            setActiveIndex(0);
            setIsOpen(true);
          }}
          onFocus={() => setIsOpen(Boolean(query.trim()))}
          onKeyDown={(event) => {
            if (event.key === 'ArrowDown' && matches.length > 0) {
              event.preventDefault();
              setIsOpen(true);
              setActiveIndex((index) =>
                Math.min(index + 1, matches.length - 1),
              );
            }
            if (event.key === 'ArrowUp' && matches.length > 0) {
              event.preventDefault();
              setActiveIndex((index) => Math.max(index - 1, 0));
            }
            if (event.key === 'Enter' && matches[activeIndex]) {
              event.preventDefault();
              choose(matches[activeIndex].id);
            }
            if (event.key === 'Escape') {
              setQuery('');
              setIsOpen(false);
            }
          }}
          placeholder="Gõ tên, SKU hoặc mã vạch"
          role="combobox"
          value={query}
          className="mt-2 min-h-11 w-full rounded-lg border border-slate-300 px-3"
        />
      </label>
      {selectedProduct ? (
        <p className="mt-2 text-xs font-semibold text-slate-700">
          {selectedProduct.sku} — {selectedProduct.name}
        </p>
      ) : null}
      {isOpen && matches.length > 0 ? (
        <ul
          id={listId}
          role="listbox"
          className="mt-1 max-h-56 overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg"
        >
          {matches.map((product, index) => (
            <li
              key={product.id}
              role="option"
              aria-selected={index === activeIndex}
            >
              <button
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => choose(product.id)}
                className={`flex w-full flex-col px-3 py-2 text-left hover:bg-slate-50 ${index === activeIndex ? 'bg-teal-50' : ''}`}
              >
                <span className="text-sm font-semibold text-slate-900">
                  {product.sku} — {product.name}
                </span>
                <span className="text-xs text-slate-600">
                  {product.unitName}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
