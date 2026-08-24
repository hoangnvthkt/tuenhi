import { useRef, useState, type FormEvent } from 'react';
import {
  SettingsApiError,
  type SettingsApi,
  type SalesChannelItem,
} from '../api/settings-api';
import {
  validateSalesChannel,
  type SalesChannelFormValues,
} from '../model/settings-validation';
import { salesChannelValues } from '../model/sales-channel-values';

const emptyChannel: SalesChannelFormValues = {
  code: '',
  name: '',
  sortOrder: '',
  isActive: true,
};

export function ChannelForm({
  api,
  item,
  isOnline,
  onCancel,
  onSaved,
}: {
  api: SettingsApi;
  item: SalesChannelItem | null;
  isOnline: boolean;
  onCancel: () => void;
  onSaved: () => Promise<void>;
}) {
  const [values, setValues] = useState(() =>
    item ? salesChannelValues(item) : emptyChannel,
  );
  const [errors, setErrors] = useState<
    Partial<Record<keyof SalesChannelFormValues, string>>
  >({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [correlationId, setCorrelationId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const key = useRef<string | null>(null);

  function update<K extends keyof SalesChannelFormValues>(
    field: K,
    value: SalesChannelFormValues[K],
  ) {
    setValues((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: undefined }));
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!isOnline || saving) return;
    const validation = validateSalesChannel(values, {
      originalCode: item?.code,
    });
    if (!validation.ok) {
      setErrors(validation.fieldErrors);
      return;
    }
    key.current ??= crypto.randomUUID();
    setSaving(true);
    setServerError(null);
    setCorrelationId(null);
    try {
      await api.saveSalesChannel({
        channelId: item?.id,
        values: validation.data,
        idempotencyKey: key.current,
      });
      key.current = null;
      await onSaved();
    } catch (error) {
      if (error instanceof SettingsApiError) {
        key.current = null;
        setServerError(
          error.code === 'DUPLICATE_IN_DATABASE'
            ? 'Mã kênh bán đã tồn tại.'
            : error.code === 'IMMUTABLE_FIELD'
              ? 'Mã kênh bán không thể thay đổi sau khi tạo.'
              : error.message,
        );
        setCorrelationId(error.correlationId);
      } else {
        setServerError(
          'Chưa xác định được kết quả. Vui lòng kiểm tra lại kênh bán trước khi thử lại.',
        );
      }
    } finally {
      setSaving(false);
    }
  }

  const inputClass =
    'min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 outline-none focus:border-teal-700 focus:ring-2 focus:ring-teal-700/15 disabled:bg-slate-100';
  return (
    <form
      noValidate
      onSubmit={submit}
      className="space-y-5 rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
    >
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-bold">
          {item ? 'Sửa kênh bán' : 'Thêm kênh bán'}
        </h2>
        <button
          type="button"
          onClick={onCancel}
          className="min-h-11 px-3 text-sm font-semibold text-slate-700"
        >
          Đóng
        </button>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <div>
          <label
            htmlFor="channel-code"
            className="mb-2 block text-sm font-medium"
          >
            Mã kênh bán
          </label>
          <input
            id="channel-code"
            disabled={Boolean(item)}
            value={values.code}
            onChange={(event) => update('code', event.target.value)}
            maxLength={32}
            className={inputClass}
          />
          {errors.code ? (
            <p className="mt-2 text-sm text-red-700">{errors.code}</p>
          ) : null}
        </div>
        <div>
          <label
            htmlFor="channel-name"
            className="mb-2 block text-sm font-medium"
          >
            Tên kênh bán
          </label>
          <input
            id="channel-name"
            value={values.name}
            onChange={(event) => update('name', event.target.value)}
            maxLength={120}
            className={inputClass}
          />
          {errors.name ? (
            <p className="mt-2 text-sm text-red-700">{errors.name}</p>
          ) : null}
        </div>
        <div>
          <label
            htmlFor="channel-sort"
            className="mb-2 block text-sm font-medium"
          >
            Thứ tự hiển thị
          </label>
          <input
            id="channel-sort"
            inputMode="numeric"
            value={values.sortOrder}
            onChange={(event) => update('sortOrder', event.target.value)}
            className={inputClass}
          />
          {errors.sortOrder ? (
            <p className="mt-2 text-sm text-red-700">{errors.sortOrder}</p>
          ) : null}
        </div>
      </div>
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
          {saving ? 'Đang lưu…' : 'Lưu kênh bán'}
        </button>
      </div>
    </form>
  );
}
