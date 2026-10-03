import { usePrivateQueryKey } from '@/features/auth';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { useOnlineStatus } from '@/shared/hooks/use-online-status';
import { refreshOperationalData } from '@/shared/api/refresh-operational-data';
import { useToast } from '@/shared/ui/feedback/use-toast';
import {
  createSettingsApi,
  SettingsApiError,
  settingsKeys,
  type SalesChannelItem,
  type SettingsApi,
} from '../api/settings-api';
import { ChannelForm } from '../components/SalesChannelForm';
import { salesChannelValues } from '../model/sales-channel-values';

export function SalesChannelPage({
  api: apiProp,
  isOnline: onlineProp,
}: {
  api?: SettingsApi;
  isOnline?: boolean;
}) {
  const privateKey = usePrivateQueryKey();
  const [api] = useState(() => apiProp ?? createSettingsApi());
  const detectedOnline = useOnlineStatus();
  const isOnline = onlineProp ?? detectedOnline;
  const toast = useToast();
  const queryClient = useQueryClient();
  const [editor, setEditor] = useState<SalesChannelItem | 'new' | null>(null);
  const [workingId, setWorkingId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const operationKeys = useRef(new Map<string, string>());
  const query = useQuery({
    queryKey: privateKey(...settingsKeys.channels(true)),
    queryFn: () => api.listSalesChannels(true),
  });

  async function refresh() {
    await refreshOperationalData(queryClient);
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
        values: { ...salesChannelValues(item), isActive: nextActive },
        idempotencyKey,
      });
      operationKeys.current.delete(action);
      await refresh();
    } catch (error) {
      if (error instanceof SettingsApiError)
        operationKeys.current.delete(action);
      setErrorMessage(
        error instanceof SettingsApiError
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
