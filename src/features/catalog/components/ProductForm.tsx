import { useRef, useState, type FormEvent } from 'react';
import { NumericField } from '@/shared/ui/forms/NumericField';
import { CatalogApiError } from '../api/catalog-api';
import type { CategoryOption, ProductFormValues } from '../model/catalog-types';
import { validateProductForm } from '../model/catalog-validation';

const emptyProduct: ProductFormValues = {
  sku: '',
  barcode: '',
  name: '',
  categoryId: '',
  unitName: '',
  description: '',
  minStockQty: '0',
  salePrice: '',
  isActive: true,
};

export type ProductSaveRequest = {
  expectedVersion?: number;
  initialSalePrice?: string | null;
  values: ProductFormValues;
  productIdempotencyKey: string;
  priceIdempotencyKey: string;
};

function productErrorMessage(error: CatalogApiError) {
  if (error.code === 'DUPLICATE_IN_DATABASE') {
    return 'SKU hoặc mã vạch đã tồn tại.';
  }
  if (error.code === 'VERSION_CONFLICT') {
    return 'Sản phẩm đã được người khác cập nhật. Vui lòng tải lại dữ liệu.';
  }
  if (error.code === 'REFERENCE_NOT_FOUND') {
    return 'Nhóm hàng không tồn tại hoặc đã ngừng hoạt động.';
  }
  return error.message;
}

export function ProductForm({
  initialValues = emptyProduct,
  categories,
  canManageSalePrice,
  canManageDefaultCost = false,
  isOnline,
  onSave,
  onDirtyChange,
  submitLabel = 'Lưu sản phẩm',
}: {
  initialValues?: ProductFormValues;
  categories: CategoryOption[];
  canManageSalePrice: boolean;
  canManageDefaultCost?: boolean;
  isOnline: boolean;
  onSave: (request: ProductSaveRequest) => Promise<void>;
  submitLabel?: string;
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const [values, setValues] = useState(initialValues);
  const [fieldErrors, setFieldErrors] = useState<
    Partial<Record<keyof ProductFormValues, string>>
  >({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [correlationId, setCorrelationId] = useState<string | null>(null);
  const [unknownOutcome, setUnknownOutcome] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const keys = useRef<{
    productIdempotencyKey: string;
    priceIdempotencyKey: string;
  } | null>(null);

  function update<K extends keyof ProductFormValues>(
    field: K,
    value: ProductFormValues[K],
  ) {
    const next = { ...values, [field]: value };
    setValues(next);
    onDirtyChange?.(JSON.stringify(next) !== JSON.stringify(initialValues));
    setFieldErrors((current) => ({ ...current, [field]: undefined }));
  }

  async function submit(event?: FormEvent) {
    event?.preventDefault();
    if (!isOnline || isSubmitting) return;

    const normalized: ProductFormValues = {
      ...values,
      sku: values.sku.trim(),
      barcode: values.barcode.trim(),
      name: values.name.trim(),
      unitName: values.unitName.trim(),
      description: values.description.trim(),
      salePrice: canManageSalePrice ? values.salePrice : '',
      defaultCost: canManageDefaultCost
        ? (values.defaultCost ?? '')
        : undefined,
    };
    const validation = validateProductForm(normalized, {
      canManageSalePrice,
      canManageDefaultCost,
    });
    if (!validation.ok) {
      setFieldErrors(validation.fieldErrors);
      return;
    }

    keys.current ??= {
      productIdempotencyKey: crypto.randomUUID(),
      priceIdempotencyKey: crypto.randomUUID(),
    };
    setValues(normalized);
    setServerError(null);
    setCorrelationId(null);
    setIsSubmitting(true);
    onDirtyChange?.(true);
    try {
      await onSave({ values: validation.data, ...keys.current });
      keys.current = null;
      setUnknownOutcome(false);
      onDirtyChange?.(false);
    } catch (error) {
      if (error instanceof CatalogApiError) {
        keys.current = null;
        setUnknownOutcome(false);
        setServerError(productErrorMessage(error));
        setCorrelationId(error.correlationId);
      } else {
        setUnknownOutcome(true);
        setServerError(
          'Chưa xác định được kết quả. Hệ thống sẽ kiểm tra lại sản phẩm trước khi gửi lại.',
        );
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  const inputClass =
    'min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 outline-none focus:border-teal-700 focus:ring-2 focus:ring-teal-700/15';
  return (
    <form noValidate onSubmit={submit} className="space-y-6">
      <fieldset
        disabled={isSubmitting || unknownOutcome}
        className="grid gap-5 md:grid-cols-2"
      >
        <div>
          <label
            htmlFor="product-sku"
            className="mb-2 block text-sm font-medium"
          >
            SKU
          </label>
          <input
            id="product-sku"
            value={values.sku}
            onChange={(event) => update('sku', event.target.value)}
            className={inputClass}
          />
          {fieldErrors.sku ? (
            <p className="mt-2 text-sm text-red-700">{fieldErrors.sku}</p>
          ) : null}
        </div>
        <div>
          <label
            htmlFor="product-barcode"
            className="mb-2 block text-sm font-medium"
          >
            Mã vạch
          </label>
          <input
            id="product-barcode"
            value={values.barcode}
            onChange={(event) => update('barcode', event.target.value)}
            className={inputClass}
          />
          {fieldErrors.barcode ? (
            <p className="mt-2 text-sm text-red-700">{fieldErrors.barcode}</p>
          ) : null}
        </div>
        <div className="md:col-span-2">
          <label
            htmlFor="product-name"
            className="mb-2 block text-sm font-medium"
          >
            Tên sản phẩm
          </label>
          <input
            id="product-name"
            value={values.name}
            onChange={(event) => update('name', event.target.value)}
            className={inputClass}
          />
          {fieldErrors.name ? (
            <p className="mt-2 text-sm text-red-700">{fieldErrors.name}</p>
          ) : null}
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
            value={values.categoryId}
            onChange={(event) => update('categoryId', event.target.value)}
            className={inputClass}
          >
            <option value="">Không chọn nhóm</option>
            {categories.map((category) => (
              <option
                key={category.id}
                value={category.id}
                disabled={!category.isActive}
              >
                {category.name}
                {category.isActive ? '' : ' (đã tắt)'}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label
            htmlFor="product-unit"
            className="mb-2 block text-sm font-medium"
          >
            Đơn vị tính
          </label>
          <input
            id="product-unit"
            value={values.unitName}
            onChange={(event) => update('unitName', event.target.value)}
            className={inputClass}
          />
          {fieldErrors.unitName ? (
            <p className="mt-2 text-sm text-red-700">{fieldErrors.unitName}</p>
          ) : null}
        </div>
        <NumericField
          label="Ngưỡng tồn tối thiểu"
          value={values.minStockQty}
          onChange={(value) => update('minStockQty', value)}
          kind="quantity"
          precision={18}
          required
          error={fieldErrors.minStockQty}
          helperText="Báo khi tồn thấp hơn ngưỡng, kể cả hết hàng. Đơn vị hộp để 0 sẽ dùng ngưỡng 50; đơn vị khác để 0 sẽ tắt cảnh báo."
        />
        {canManageSalePrice ? (
          <NumericField
            label="Giá bán hiện hành"
            value={values.salePrice}
            onChange={(value) => update('salePrice', value)}
            kind="money"
            precision={18}
            error={fieldErrors.salePrice}
            helperText="Chỉ chủ cửa hàng được thay đổi giá bán."
          />
        ) : null}
        {canManageDefaultCost ? (
          <NumericField
            label="Giá vốn mặc định"
            value={values.defaultCost ?? ''}
            onChange={(value) => update('defaultCost', value)}
            kind="money"
            precision={18}
            positive
            error={fieldErrors.defaultCost}
            helperText="Dùng để điền sẵn đơn giá nhập; có thể sửa theo từng lần nhập. Chưa làm tăng tồn kho. Để trống nếu chưa có giá."
          />
        ) : null}
        <div className="md:col-span-2">
          <label
            htmlFor="product-description"
            className="mb-2 block text-sm font-medium"
          >
            Mô tả
          </label>
          <textarea
            id="product-description"
            rows={4}
            value={values.description}
            onChange={(event) => update('description', event.target.value)}
            className={`${inputClass} py-3`}
          />
          {fieldErrors.description ? (
            <p className="mt-2 text-sm text-red-700">
              {fieldErrors.description}
            </p>
          ) : null}
        </div>
        <label className="flex min-h-11 items-center gap-3 text-sm font-medium text-slate-800 md:col-span-2">
          <input
            type="checkbox"
            checked={values.isActive}
            onChange={(event) => update('isActive', event.target.checked)}
            className="h-4 w-4 accent-teal-700"
          />
          Sản phẩm đang hoạt động
        </label>
      </fieldset>

      {!isOnline ? (
        <p
          role="status"
          className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900"
        >
          Cần kết nối mạng để lưu sản phẩm.
        </p>
      ) : null}
      {serverError ? (
        <div
          role="alert"
          className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800"
        >
          <p>{serverError}</p>
          {correlationId ? (
            <code className="mt-1 block text-xs">{correlationId}</code>
          ) : null}
        </div>
      ) : null}
      <div className="flex justify-end">
        <button
          type="submit"
          disabled={!isOnline || isSubmitting}
          className="min-h-11 rounded-lg bg-teal-700 px-4 text-sm font-semibold text-white hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isSubmitting
            ? 'Đang lưu…'
            : unknownOutcome
              ? 'Thử lưu lại'
              : submitLabel}
        </button>
      </div>
    </form>
  );
}
