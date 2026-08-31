import type { ProductCatalogItem } from '@/features/catalog';

export function PrefilledProductIntent({
  product,
  warning,
  disabled,
  onAdd,
  onDismiss,
}: {
  product: ProductCatalogItem | null;
  warning: string | null;
  disabled: boolean;
  onAdd: (product: ProductCatalogItem) => void;
  onDismiss: () => void;
}) {
  if (warning) {
    return (
      <p
        role="alert"
        className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"
      >
        {warning}
      </p>
    );
  }
  if (!product) return null;
  return (
    <div className="rounded-lg border border-teal-200 bg-teal-50 p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-teal-800">
        Sản phẩm được mở từ liên kết
      </p>
      <p className="mt-1 font-bold text-slate-950">{product.name}</p>
      <p className="text-xs text-slate-600">{product.sku}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={disabled || !product.currentSalePrice}
          onClick={() => onAdd(product)}
          className="min-h-11 rounded-lg bg-teal-700 px-4 text-sm font-semibold text-white disabled:opacity-50"
        >
          Thêm vào giỏ
        </button>
        <button
          type="button"
          onClick={onDismiss}
          className="min-h-11 px-3 text-sm font-semibold text-slate-700"
        >
          Bỏ qua
        </button>
      </div>
    </div>
  );
}
