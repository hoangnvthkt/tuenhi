import { useMemo, useState } from 'react';

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
}: {
  label: string;
  products: PurchaseProductOption[];
  selectedProductId: string;
  selectedProductIds: Set<string>;
  disabled?: boolean;
  onSelect: (productId: string) => void;
}) {
  const [query, setQuery] = useState('');
  const normalizedQuery = query.trim().toLocaleLowerCase('vi-VN');
  const matches = useMemo(
    () =>
      normalizedQuery
        ? products.filter(
            (product) =>
              product.isActive &&
              (product.id === selectedProductId ||
                !selectedProductIds.has(product.id)) &&
              [product.sku, product.name, product.barcode ?? ''].some((value) =>
                value.toLocaleLowerCase('vi-VN').includes(normalizedQuery),
              ),
          )
        : [],
    [normalizedQuery, products, selectedProductId, selectedProductIds],
  );
  const selectedProduct = products.find(
    (product) => product.id === selectedProductId,
  );
  const listId = `${label.replace(/[^a-z0-9]/gi, '-').toLowerCase()}-options`;

  function choose(productId: string) {
    onSelect(productId);
    setQuery('');
  }

  return (
    <div>
      <label className="text-sm font-semibold">
        {label}
        <input
          aria-controls={listId}
          aria-expanded={matches.length > 0}
          aria-label={label}
          autoComplete="off"
          disabled={disabled}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && matches[0]) {
              event.preventDefault();
              choose(matches[0].id);
            }
            if (event.key === 'Escape') setQuery('');
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
      {matches.length > 0 ? (
        <ul
          id={listId}
          role="listbox"
          className="mt-1 max-h-56 overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg"
        >
          {matches.map((product) => (
            <li key={product.id} role="option" aria-selected={false}>
              <button
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => choose(product.id)}
                className="flex w-full flex-col px-3 py-2 text-left hover:bg-slate-50"
              >
                <span className="text-sm font-semibold text-slate-900">
                  {product.sku} — {product.name}
                </span>
                <span className="text-xs text-slate-600">{product.unitName}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
