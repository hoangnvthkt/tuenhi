import type { ProductCatalogItem } from '@/features/catalog';
import { formatPosMoney } from '../model/format-money';

export function ProductPicker({
  search,
  products,
  isLoading,
  onSearchChange,
  onAdd,
}: {
  search: string;
  products: ProductCatalogItem[];
  isLoading: boolean;
  onSearchChange: (value: string) => void;
  onAdd: (product: ProductCatalogItem) => void;
}) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4">
      <label className="mb-2 block text-sm font-medium">
        Tìm hoặc quét mã vạch
      </label>
      <input
        autoFocus
        value={search}
        onChange={(event) => onSearchChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && products[0]) onAdd(products[0]);
        }}
        placeholder="Tên hàng, SKU hoặc mã vạch rồi nhấn Enter"
        className="min-h-11 w-full rounded-lg border border-slate-300 px-3"
      />
      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        {products.map((product) => (
          <button
            key={product.id}
            type="button"
            onClick={() => onAdd(product)}
            disabled={!product.currentSalePrice}
            className="rounded-lg border border-slate-200 p-3 text-left hover:border-teal-500 disabled:cursor-not-allowed disabled:bg-slate-50"
          >
            <p className="font-medium text-slate-950">{product.name}</p>
            <p className="text-xs text-slate-500">
              {product.sku} · Tồn {product.onHandQty} {product.unitName}
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
