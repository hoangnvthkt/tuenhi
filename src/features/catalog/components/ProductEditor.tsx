import { Link, useBlocker, useNavigate } from 'react-router';
import { useEffect, useRef, useState } from 'react';
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
  onSave: (request: ProductSaveRequest) => Promise<string>;
}) {
  const navigate = useNavigate();
  const [baseline, setBaseline] = useState(detail);
  const [dirty, setDirty] = useState(false);
  const [confirmReload, setConfirmReload] = useState(false);
  const dirtyRef = useRef(false);
  const blocker = useBlocker(() => dirtyRef.current);
  if (!dirty && detail?.version !== baseline?.version) setBaseline(detail);
  const changed = detail?.version !== baseline?.version;
  function onDirtyChange(value: boolean) {
    dirtyRef.current = value;
    setDirty(value);
  }
  useEffect(() => {
    const preventClose = (event: BeforeUnloadEvent) => {
      if (dirtyRef.current) {
        event.preventDefault();
        event.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', preventClose);
    return () => window.removeEventListener('beforeunload', preventClose);
  }, []);
  async function save(request: ProductSaveRequest) {
    const id = await onSave({
      ...request,
      expectedVersion: baseline?.version,
      initialSalePrice: baseline?.currentSalePrice,
    });
    onDirtyChange(false);
    navigate(`/products/${id}`);
  }
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
      {changed && dirty ? (
        <div className="rounded-lg bg-amber-50 p-3 text-sm">
          <p>
            Sản phẩm có bản cập nhật mới. Nội dung anh/chị đang nhập vẫn được
            giữ.
          </p>
          <button
            type="button"
            onClick={() => setConfirmReload(true)}
            className="min-h-11 font-semibold text-teal-800"
          >
            Tải bản mới
          </button>
        </div>
      ) : null}
      {confirmReload ? (
        <section
          aria-label="Xác nhận tải bản mới"
          className="rounded-lg border border-amber-300 p-3"
        >
          <p>Tải bản mới sẽ bỏ nội dung chưa lưu.</p>
          <button
            type="button"
            onClick={() => {
              onDirtyChange(false);
              setBaseline(detail);
              setConfirmReload(false);
            }}
            className="min-h-11 px-3 font-semibold text-red-800"
          >
            Bỏ thay đổi và tải lại
          </button>
          <button
            type="button"
            onClick={() => setConfirmReload(false)}
            className="min-h-11 px-3"
          >
            Tiếp tục chỉnh sửa
          </button>
        </section>
      ) : null}
      {blocker.state === 'blocked' ? (
        <section
          aria-label="Thay đổi chưa lưu"
          className="rounded-lg border border-amber-300 p-3"
        >
          <p>Nội dung chưa lưu sẽ mất nếu rời trang.</p>
          <button
            type="button"
            onClick={() => blocker.reset()}
            className="min-h-11 px-3 font-semibold text-teal-800"
          >
            Ở lại chỉnh sửa
          </button>
          <button
            type="button"
            onClick={() => blocker.proceed()}
            className="min-h-11 px-3 text-red-800"
          >
            Bỏ thay đổi và rời trang
          </button>
        </section>
      ) : null}
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <ProductForm
          key={baseline?.version ?? 'new'}
          initialValues={baseline ? productFormValues(baseline) : undefined}
          categories={categories}
          canManageSalePrice={canManageSalePrice}
          isOnline={isOnline}
          onSave={save}
          onDirtyChange={onDirtyChange}
        />
      </div>
    </section>
  );
}
