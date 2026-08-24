import { useRef, useState, type FormEvent } from 'react';
import {
  DirectoryApiError,
  type DirectoryApi,
  type SupplierItem,
} from '../api/directory-api';
import {
  validateSupplier,
  type SupplierFormValues,
} from '../model/directory-validation';

const emptySupplier: SupplierFormValues = {
  code: '',
  name: '',
  phone: '',
  email: '',
  address: '',
  notes: '',
  isActive: true,
};

function supplierValues(item: SupplierItem): SupplierFormValues {
  return {
    code: item.code ?? '',
    name: item.name,
    phone: item.phone ?? '',
    email: item.email ?? '',
    address: item.address ?? '',
    notes: item.notes ?? '',
    isActive: item.isActive,
  };
}

export function SupplierForm({
  item,
  isOnline,
  onCancel,
  onSaved,
  api,
}: {
  item: SupplierItem | null;
  isOnline: boolean;
  onCancel: () => void;
  onSaved: () => Promise<void>;
  api: DirectoryApi;
}) {
  const [values, setValues] = useState(() =>
    item ? supplierValues(item) : emptySupplier,
  );
  const [errors, setErrors] = useState<
    Partial<Record<keyof SupplierFormValues, string>>
  >({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [correlationId, setCorrelationId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const key = useRef<string | null>(null);

  function update<K extends keyof SupplierFormValues>(
    field: K,
    value: SupplierFormValues[K],
  ) {
    setValues((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: undefined }));
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!isOnline || saving) return;
    const validation = validateSupplier(values);
    if (!validation.ok) {
      setErrors(validation.fieldErrors);
      return;
    }
    key.current ??= crypto.randomUUID();
    setSaving(true);
    setServerError(null);
    setCorrelationId(null);
    try {
      await api.saveSupplier({
        supplierId: item?.id,
        expectedVersion: item?.version,
        values: validation.data,
        idempotencyKey: key.current,
      });
      key.current = null;
      await onSaved();
    } catch (error) {
      if (error instanceof DirectoryApiError) {
        key.current = null;
        setServerError(
          error.code === 'DUPLICATE_IN_DATABASE'
            ? 'Mã nhà cung cấp đã tồn tại.'
            : error.code === 'VERSION_CONFLICT'
              ? 'Nhà cung cấp đã được người khác cập nhật. Vui lòng tải lại dữ liệu.'
              : error.message,
        );
        setCorrelationId(error.correlationId);
      } else {
        setServerError(
          'Chưa xác định được kết quả. Vui lòng kiểm tra lại nhà cung cấp trước khi thử lại.',
        );
      }
    } finally {
      setSaving(false);
    }
  }

  const inputClass =
    'min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 outline-none focus:border-teal-700 focus:ring-2 focus:ring-teal-700/15';
  const field = (
    label: string,
    name: keyof SupplierFormValues,
    options: { type?: string; maxLength?: number } = {},
  ) => (
    <div>
      <label
        htmlFor={`supplier-${name}`}
        className="mb-2 block text-sm font-medium"
      >
        {label}
      </label>
      <input
        id={`supplier-${name}`}
        type={options.type}
        maxLength={options.maxLength}
        value={String(values[name])}
        onChange={(event) => update(name, event.target.value as never)}
        className={inputClass}
      />
      {errors[name] ? (
        <p className="mt-2 text-sm text-red-700">{errors[name]}</p>
      ) : null}
    </div>
  );

  return (
    <form
      onSubmit={submit}
      noValidate
      className="space-y-5 rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
    >
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-bold">
          {item ? 'Sửa nhà cung cấp' : 'Thêm nhà cung cấp'}
        </h2>
        <button
          type="button"
          onClick={onCancel}
          className="min-h-11 px-3 text-sm font-semibold text-slate-700"
        >
          Đóng
        </button>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {field('Mã nhà cung cấp', 'code', { maxLength: 64 })}
        {field('Tên nhà cung cấp', 'name', { maxLength: 200 })}
        {field('Số điện thoại', 'phone')}
        {field('Email', 'email', { type: 'email', maxLength: 254 })}
        <div className="md:col-span-2">
          {field('Địa chỉ', 'address', { maxLength: 500 })}
        </div>
        <div className="md:col-span-2">
          <label
            htmlFor="supplier-notes"
            className="mb-2 block text-sm font-medium"
          >
            Ghi chú
          </label>
          <textarea
            id="supplier-notes"
            rows={3}
            maxLength={1000}
            value={values.notes}
            onChange={(event) => update('notes', event.target.value)}
            className={`${inputClass} py-3`}
          />
          {errors.notes ? (
            <p className="mt-2 text-sm text-red-700">{errors.notes}</p>
          ) : null}
        </div>
        <label className="flex min-h-11 items-center gap-3 text-sm font-medium md:col-span-2">
          <input
            type="checkbox"
            checked={values.isActive}
            onChange={(event) => update('isActive', event.target.checked)}
            className="h-4 w-4 accent-teal-700"
          />
          Nhà cung cấp đang hoạt động
        </label>
      </div>
      {!isOnline ? (
        <p
          role="status"
          className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900"
        >
          Cần kết nối mạng để lưu nhà cung cấp.
        </p>
      ) : null}
      {serverError ? (
        <div
          role="alert"
          className="rounded-lg bg-red-50 p-3 text-sm text-red-800"
        >
          <p>{serverError}</p>
          {correlationId ? (
            <code className="mt-1 block text-xs">{correlationId}</code>
          ) : null}
        </div>
      ) : null}
      <div className="flex justify-end">
        <button
          disabled={!isOnline || saving}
          className="min-h-11 rounded-lg bg-teal-700 px-4 text-sm font-semibold text-white disabled:opacity-50"
        >
          {saving ? 'Đang lưu…' : 'Lưu nhà cung cấp'}
        </button>
      </div>
    </form>
  );
}
