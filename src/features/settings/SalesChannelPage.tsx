import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRef, useState, type FormEvent } from 'react';
import { useOnlineStatus } from '@/shared/hooks/use-online-status';
import { useToast } from '@/shared/ui/feedback/use-toast';
import {
  createDirectoryApi,
  DirectoryApiError,
  directoryKeys,
  type DirectoryApi,
  type SalesChannelItem,
} from '../directories/directory-api';
import {
  validateSalesChannel,
  type SalesChannelFormValues,
} from '../directories/directory-validation';

const emptyChannel: SalesChannelFormValues = {
  code: '',
  name: '',
  sortOrder: '',
  isActive: true,
};

function channelValues(item: SalesChannelItem): SalesChannelFormValues {
  return {
    code: item.code,
    name: item.name,
    sortOrder: String(item.sortOrder),
    isActive: item.isActive,
  };
}

function ChannelForm({
  api,
  item,
  isOnline,
  onCancel,
  onSaved,
}: {
  api: DirectoryApi;
  item: SalesChannelItem | null;
  isOnline: boolean;
  onCancel: () => void;
  onSaved: () => Promise<void>;
}) {
  const [values, setValues] = useState(() =>
    item ? channelValues(item) : emptyChannel,
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
      if (error instanceof DirectoryApiError) {
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

export function SalesChannelPage({
  api: apiProp,
  isOnline: onlineProp,
}: {
  api?: DirectoryApi;
  isOnline?: boolean;
}) {
  const [api] = useState(() => apiProp ?? createDirectoryApi());
  const detectedOnline = useOnlineStatus();
  const isOnline = onlineProp ?? detectedOnline;
  const toast = useToast();
  const queryClient = useQueryClient();
  const [editor, setEditor] = useState<SalesChannelItem | 'new' | null>(null);
  const [workingId, setWorkingId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const operationKeys = useRef(new Map<string, string>());
  const query = useQuery({
    queryKey: directoryKeys.channels(true),
    queryFn: () => api.listSalesChannels(true),
  });

  async function refresh() {
    await queryClient.invalidateQueries({
      queryKey: directoryKeys.channels(true),
    });
    await queryClient.invalidateQueries({
      queryKey: directoryKeys.channels(false),
    });
    setEditor(null);
    toast.show({ kind: 'success', title: 'Đã lưu kênh bán' });
  }

  async function toggle(item: SalesChannelItem) {
    const nextActive = !item.isActive;
    if (
      !nextActive &&
      !window.confirm(
        `Ngừng kênh “${item.name}”? Kênh này sẽ không thể dùng cho hóa đơn mới.`,
      )
    )
      return;
    const action = `${item.id}:${nextActive}`;
    const idempotencyKey =
      operationKeys.current.get(action) ?? crypto.randomUUID();
    operationKeys.current.set(action, idempotencyKey);
    setWorkingId(item.id);
    setErrorMessage(null);
    try {
      await api.saveSalesChannel({
        channelId: item.id,
        values: { ...channelValues(item), isActive: nextActive },
        idempotencyKey,
      });
      operationKeys.current.delete(action);
      await refresh();
    } catch (error) {
      if (error instanceof DirectoryApiError)
        operationKeys.current.delete(action);
      setErrorMessage(
        error instanceof DirectoryApiError
          ? error.message
          : 'Chưa xác định được kết quả. Vui lòng kiểm tra lại trước khi thử lại.',
      );
    } finally {
      setWorkingId(null);
    }
  }

  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Kênh bán</h1>
          <p className="mt-1 text-sm text-slate-600">
            Cấu hình kênh áp dụng khi tạo hóa đơn.
          </p>
        </div>
        <button
          type="button"
          disabled={!isOnline}
          onClick={() => setEditor('new')}
          className="min-h-11 rounded-lg bg-teal-700 px-4 text-sm font-semibold text-white disabled:opacity-50"
        >
          Thêm kênh bán
        </button>
      </div>
      {!isOnline ? (
        <p
          role="status"
          className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900"
        >
          Cần kết nối mạng để cập nhật kênh bán.
        </p>
      ) : null}
      {errorMessage ? (
        <p
          role="alert"
          className="rounded-lg bg-red-50 p-3 text-sm text-red-800"
        >
          {errorMessage}
        </p>
      ) : null}
      {editor ? (
        <ChannelForm
          key={editor === 'new' ? 'new' : `${editor.id}:${editor.version}`}
          api={api}
          item={editor === 'new' ? null : editor}
          isOnline={isOnline}
          onCancel={() => setEditor(null)}
          onSaved={refresh}
        />
      ) : null}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        {query.isPending ? (
          <p className="p-5 text-sm text-slate-600">Đang tải kênh bán…</p>
        ) : null}
        {query.isError ? (
          <div role="alert" className="p-5 text-red-800">
            <p>Không thể tải kênh bán.</p>
            <button
              type="button"
              onClick={() => void query.refetch()}
              className="mt-3 min-h-11 rounded-lg border border-red-300 px-4 font-semibold"
            >
              Thử lại
            </button>
          </div>
        ) : null}
        <ul className="divide-y divide-slate-200">
          {query.data?.map((item) => (
            <li
              key={item.id}
              data-testid={`sales-channel-row-${item.id}`}
              className="grid gap-3 p-4 md:grid-cols-[8rem_1fr_5rem_auto_auto] md:items-center"
            >
              <code className="text-xs text-slate-600">{item.code}</code>
              <div>
                <strong>{item.name}</strong>
                {!item.isActive ? (
                  <span className="ml-2 rounded bg-slate-200 px-2 py-1 text-xs">
                    Đã tắt
                  </span>
                ) : null}
              </div>
              <span className="text-sm tabular-nums text-slate-600">
                {item.sortOrder}
              </span>
              <button
                type="button"
                disabled={!isOnline || Boolean(workingId)}
                aria-label={`Sửa ${item.name}`}
                onClick={() => setEditor(item)}
                className="min-h-11 rounded-lg border border-slate-300 px-4 text-sm font-semibold disabled:opacity-50"
              >
                Sửa
              </button>
              <button
                type="button"
                disabled={!isOnline || Boolean(workingId)}
                aria-label={`${item.isActive ? 'Ngừng' : 'Bật'} ${item.name}`}
                onClick={() => void toggle(item)}
                className="min-h-11 rounded-lg border border-slate-300 px-4 text-sm font-semibold disabled:opacity-50"
              >
                {item.isActive ? 'Ngừng' : 'Bật lại'}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
