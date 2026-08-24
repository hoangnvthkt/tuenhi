import { useQuery, useQueryClient } from '@tanstack/react-query';
import { parsePhoneNumber } from 'libphonenumber-js';
import { useRef, useState, type FormEvent } from 'react';
import { useOnlineStatus } from '@/shared/hooks/use-online-status';
import { useToast } from '@/shared/ui/feedback/use-toast';
import { useSession } from '../auth/use-session';
import {
  createDirectoryApi,
  DirectoryApiError,
  directoryKeys,
  type CustomerItem,
  type DirectoryApi,
  type DirectoryCursor,
} from './directory-api';
import {
  validateCustomer,
  type CustomerFormValues,
} from './directory-validation';

const emptyCustomer: CustomerFormValues = {
  code: '',
  customerType: 'INDIVIDUAL',
  name: '',
  phone: '',
  email: '',
  address: '',
  companyName: '',
  taxCode: '',
  customerGroup: '',
  notes: '',
  isActive: true,
};

function customerValues(item: CustomerItem): CustomerFormValues {
  return {
    code: item.code ?? '',
    customerType: item.customerType,
    name: item.name,
    phone: item.phone ?? '',
    email: item.email ?? '',
    address: item.address ?? '',
    companyName: item.companyName ?? '',
    taxCode: item.taxCode ?? '',
    customerGroup: item.customerGroup ?? '',
    notes: item.notes ?? '',
    isActive: item.isActive,
  };
}

function readablePhone(value: string | null) {
  if (!value) return null;
  try {
    return parsePhoneNumber(value).formatInternational();
  } catch {
    return value;
  }
}

type CustomerTextField = Exclude<
  keyof CustomerFormValues,
  'customerType' | 'isActive'
>;

function CustomerForm({
  item,
  isOnline,
  onCancel,
  onSaved,
  api,
}: {
  item: CustomerItem | null;
  isOnline: boolean;
  onCancel: () => void;
  onSaved: () => Promise<void>;
  api: DirectoryApi;
}) {
  const [values, setValues] = useState(() =>
    item ? customerValues(item) : emptyCustomer,
  );
  const [errors, setErrors] = useState<
    Partial<Record<keyof CustomerFormValues, string>>
  >({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [correlationId, setCorrelationId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const key = useRef<string | null>(null);

  function update<K extends keyof CustomerFormValues>(
    field: K,
    value: CustomerFormValues[K],
  ) {
    setValues((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: undefined }));
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!isOnline || saving) return;
    const validation = validateCustomer(values);
    if (!validation.ok) {
      setErrors(validation.fieldErrors);
      return;
    }
    key.current ??= crypto.randomUUID();
    setSaving(true);
    setServerError(null);
    setCorrelationId(null);
    try {
      await api.saveCustomer({
        customerId: item?.id,
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
            ? 'Mã khách hàng đã tồn tại.'
            : error.code === 'VERSION_CONFLICT'
              ? 'Khách hàng đã được người khác cập nhật. Vui lòng tải lại dữ liệu.'
              : error.message,
        );
        setCorrelationId(error.correlationId);
      } else {
        setServerError(
          'Chưa xác định được kết quả. Vui lòng kiểm tra lại khách hàng trước khi thử lại.',
        );
      }
    } finally {
      setSaving(false);
    }
  }

  const inputClass =
    'min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 outline-none focus:border-teal-700 focus:ring-2 focus:ring-teal-700/15';
  function textField(
    label: string,
    name: CustomerTextField,
    options: { type?: string; maxLength?: number } = {},
  ) {
    return (
      <div>
        <label
          htmlFor={`customer-${name}`}
          className="mb-2 block text-sm font-medium"
        >
          {label}
        </label>
        <input
          id={`customer-${name}`}
          type={options.type}
          maxLength={options.maxLength}
          value={values[name]}
          onChange={(event) => update(name, event.target.value)}
          className={inputClass}
        />
        {errors[name] ? (
          <p className="mt-2 text-sm text-red-700">{errors[name]}</p>
        ) : null}
      </div>
    );
  }

  return (
    <form
      noValidate
      onSubmit={submit}
      className="space-y-5 rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
    >
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-bold">
          {item ? 'Sửa khách hàng' : 'Thêm khách hàng'}
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
        <div>
          <label
            htmlFor="customer-type"
            className="mb-2 block text-sm font-medium"
          >
            Loại khách hàng
          </label>
          <select
            id="customer-type"
            value={values.customerType}
            onChange={(event) =>
              update(
                'customerType',
                event.target.value as CustomerFormValues['customerType'],
              )
            }
            className={inputClass}
          >
            <option value="INDIVIDUAL">Cá nhân</option>
            <option value="BUSINESS">Doanh nghiệp</option>
          </select>
        </div>
        {textField('Mã khách hàng', 'code', { maxLength: 64 })}
        {textField('Tên khách hàng', 'name', { maxLength: 200 })}
        {textField('Số điện thoại', 'phone')}
        {textField('Email', 'email', { type: 'email', maxLength: 254 })}
        {textField('Nhóm khách', 'customerGroup', { maxLength: 120 })}
        {values.customerType === 'BUSINESS'
          ? textField('Tên công ty', 'companyName', { maxLength: 200 })
          : null}
        {textField('Mã số thuế', 'taxCode', { maxLength: 32 })}
        <div className="md:col-span-2">
          {textField('Địa chỉ', 'address', { maxLength: 500 })}
        </div>
        <div className="md:col-span-2">
          <label
            htmlFor="customer-notes"
            className="mb-2 block text-sm font-medium"
          >
            Ghi chú
          </label>
          <textarea
            id="customer-notes"
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
          Khách hàng đang hoạt động
        </label>
      </div>
      {!isOnline ? (
        <p
          role="status"
          className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900"
        >
          Cần kết nối mạng để lưu khách hàng.
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
          {saving ? 'Đang lưu…' : 'Lưu khách hàng'}
        </button>
      </div>
    </form>
  );
}

export function CustomerPage({
  api: apiProp,
  isOnline: onlineProp,
}: {
  api?: DirectoryApi;
  isOnline?: boolean;
}) {
  const [api] = useState(() => apiProp ?? createDirectoryApi());
  const detectedOnline = useOnlineStatus();
  const isOnline = onlineProp ?? detectedOnline;
  const { session } = useSession();
  const toast = useToast();
  const queryClient = useQueryClient();
  const canManage = session?.permissions.includes('customer.manage') ?? false;
  const [draft, setDraft] = useState('');
  const [search, setSearch] = useState('');
  const [cursor, setCursor] = useState<DirectoryCursor | undefined>();
  const [editor, setEditor] = useState<CustomerItem | 'new' | null>(null);
  const query = useQuery({
    queryKey: directoryKeys.customers({ search, cursor }),
    queryFn: () => api.listCustomers({ search, cursor, limit: 30 }),
  });

  async function saved() {
    await queryClient.invalidateQueries({ queryKey: directoryKeys.all });
    setEditor(null);
    toast.show({ kind: 'success', title: 'Đã lưu khách hàng' });
  }

  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Khách hàng</h1>
          <p className="mt-1 text-sm text-slate-600">
            Tra cứu khách cá nhân và doanh nghiệp.
          </p>
        </div>
        {canManage ? (
          <button
            type="button"
            onClick={() => setEditor('new')}
            className="min-h-11 rounded-lg bg-teal-700 px-4 text-sm font-semibold text-white"
          >
            Thêm khách hàng
          </button>
        ) : null}
      </div>
      {editor ? (
        <CustomerForm
          key={editor === 'new' ? 'new' : `${editor.id}:${editor.version}`}
          item={editor === 'new' ? null : editor}
          api={api}
          isOnline={isOnline}
          onCancel={() => setEditor(null)}
          onSaved={saved}
        />
      ) : null}
      <form
        onSubmit={(event) => {
          event.preventDefault();
          setCursor(undefined);
          setSearch(draft.trim());
        }}
        className="flex gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
      >
        <div className="flex-1">
          <label
            htmlFor="customer-search"
            className="mb-2 block text-sm font-medium"
          >
            Tìm khách hàng
          </label>
          <input
            id="customer-search"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Tên, mã hoặc điện thoại"
            className="min-h-11 w-full rounded-lg border border-slate-300 px-3"
          />
        </div>
        <button className="mt-7 min-h-11 rounded-lg bg-slate-900 px-4 text-sm font-semibold text-white">
          Tìm kiếm
        </button>
      </form>
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        {query.isPending ? (
          <p className="p-5 text-sm text-slate-600">Đang tải khách hàng…</p>
        ) : null}
        {query.isError ? (
          <div role="alert" className="p-5 text-red-800">
            <p>Không thể tải khách hàng.</p>
            <button
              type="button"
              onClick={() => void query.refetch()}
              className="mt-3 min-h-11 rounded-lg border border-red-300 px-4 font-semibold"
            >
              Thử lại
            </button>
          </div>
        ) : null}
        {query.data?.items.length === 0 ? (
          <p className="p-5 text-sm text-slate-600">Chưa có khách hàng.</p>
        ) : null}
        <ul className="divide-y divide-slate-200">
          {query.data?.items.map((item) => (
            <li
              key={item.id}
              className="grid gap-3 p-4 md:grid-cols-[1fr_13rem_auto] md:items-center"
            >
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <strong>{item.name}</strong>
                  <span className="rounded bg-slate-100 px-2 py-1 text-xs">
                    {item.customerType === 'BUSINESS'
                      ? 'Doanh nghiệp'
                      : 'Cá nhân'}
                  </span>
                  {!item.isActive ? (
                    <span className="rounded bg-slate-200 px-2 py-1 text-xs">
                      Ngừng hoạt động
                    </span>
                  ) : null}
                </div>
                <p className="mt-1 text-xs text-slate-600">
                  {item.code || 'Chưa có mã'}
                  {item.companyName ? ` · ${item.companyName}` : ''}
                </p>
              </div>
              <p className="text-sm text-slate-700">
                {readablePhone(item.phone) ?? 'Chưa có điện thoại'}
              </p>
              {canManage ? (
                <button
                  type="button"
                  aria-label={`Sửa ${item.name}`}
                  onClick={() => setEditor(item)}
                  className="min-h-11 rounded-lg border border-slate-300 px-4 text-sm font-semibold"
                >
                  Sửa
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      </div>
      {query.data?.nextCursor ? (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => setCursor(query.data?.nextCursor ?? undefined)}
            className="min-h-11 rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold"
          >
            Trang tiếp
          </button>
        </div>
      ) : null}
    </section>
  );
}
