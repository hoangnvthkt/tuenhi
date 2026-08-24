import { Link } from 'react-router';
import type {
  CategoryOption,
  ProductDetail,
  ProductFormValues,
} from '../model/catalog-types';
import { ProductForm, type ProductSaveRequest } from './ProductForm';

function productFormValues(detail: ProductDetail): ProductFormValues {
  return {
    sku: detail.sku,
    barcode: detail.barcode ?? '',
    name: detail.name,
    categoryId: detail.categoryId ?? '',
    unitName: detail.unitName,
    description: detail.description ?? '',
    minStockQty: detail.minStockQty,
    salePrice: detail.currentSalePrice ?? '',
    isActive: detail.isActive,
  };
}

export function ProductEditor({
  canManageSalePrice,
  categories,
  detail,
  isOnline,
  mode,
  onSave,
}: {
  canManageSalePrice: boolean;
  categories: CategoryOption[];
  detail: ProductDetail | undefined;
  isOnline: boolean;
  mode: 'create' | 'edit';
  onSave: (request: ProductSaveRequest) => Promise<void>;
}) {
  return (
    <section className="space-y-5">
      <div>
        <Link
          to={detail ? `/products/${detail.id}` : '/products'}
          className="text-sm font-semibold text-teal-800 hover:underline"
        >
          ← {detail ? 'Về chi tiết sản phẩm' : 'Về danh sách sản phẩm'}
        </Link>
        <h1 className="mt-3 text-2xl font-bold tracking-tight text-slate-950">
          {mode === 'create' ? 'Thêm sản phẩm' : 'Sửa sản phẩm'}
        </h1>
      </div>
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <ProductForm
          key={detail?.version ?? 'new'}
          initialValues={detail ? productFormValues(detail) : undefined}
          categories={categories}
          canManageSalePrice={canManageSalePrice}
          isOnline={isOnline}
          onSave={onSave}
        />
      </div>
    </section>
  );
}
