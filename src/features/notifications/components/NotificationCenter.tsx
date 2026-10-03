import { useCursorList } from '@/shared/hooks/use-cursor-list';
import { ListPagination } from '@/shared/ui/feedback/ListPagination';
import { SessionContextValue } from '@/features/auth';
import { privateQueryKey } from '@/shared/api/private-query-key';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Bell } from '@phosphor-icons/react';
import { useContext, useEffect, useMemo, useState } from 'react';
import { NotificationApiContext } from '../model/notification-context';
import type {
  NotificationApi,
  UserNotification,
} from '../api/notification-api';

export type {
  NotificationApi,
  NotificationFeed,
} from '../api/notification-api';

const severityLabels = {
  INFO: 'Thông tin',
  SUCCESS: 'Thành công',
  WARNING: 'Cảnh báo',
  ERROR: 'Lỗi',
} as const;

function NotificationRow({
  notification,
  onMarkRead,
  pending,
}: {
  notification: UserNotification;
  onMarkRead: (id: string) => void;
  pending: boolean;
}) {
  return (
    <li className="border-b border-slate-200 px-5 py-4 last:border-b-0">
      <div className="flex items-start gap-3">
        <span
          aria-hidden="true"
          className={`mt-2 h-2 w-2 shrink-0 rounded-full ${notification.readAt ? 'bg-slate-300' : 'bg-teal-600'}`}
        />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            {severityLabels[notification.severity]}
          </p>
          <p className="mt-1 text-sm font-semibold text-slate-950">
            {notification.title}
          </p>
          <p className="mt-1 text-sm leading-5 text-slate-600">
            {notification.message}
          </p>
          <time
            dateTime={notification.createdAt}
            className="mt-2 block text-xs text-slate-500"
          >
            {new Intl.DateTimeFormat('vi-VN', {
              dateStyle: 'short',
              timeStyle: 'short',
            }).format(new Date(notification.createdAt))}
          </time>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {notification.actionRoute ? (
              <a
                href={notification.actionRoute}
                className="inline-flex min-h-11 items-center rounded-lg px-3 text-sm font-medium text-teal-800 hover:bg-teal-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700"
              >
                Xem chi tiết
              </a>
            ) : null}
            {!notification.readAt ? (
              <button
                type="button"
                disabled={pending}
                aria-label={`Đánh dấu đã đọc: ${notification.title}`}
                onClick={() => onMarkRead(notification.id)}
                className="min-h-11 rounded-lg px-3 text-sm font-medium text-slate-700 hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 disabled:opacity-60"
              >
                Đã đọc
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </li>
  );
}

export function NotificationCenter({
  api: apiProp,
}: {
  api?: NotificationApi;
}) {
  const contextApi = useContext(NotificationApiContext);
  const api = apiProp ?? contextApi;
  if (!api) {
    throw new Error('NotificationCenter cần NotificationApi.');
  }

  const auth = useContext(SessionContextValue);
  const userId = auth?.session?.userId;
  const [unreadOnly, setUnreadOnly] = useState(false);
  const notificationQueryKey = useMemo(
    () =>
      privateQueryKey(
        userId ?? 'no-session',
        'notifications',
        'mine',
        unreadOnly,
      ),
    [userId, unreadOnly],
  );
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const query = useCursorList({
    queryKey: notificationQueryKey,
    load: (cursor: { createdAt: string; id: string } | undefined) =>
      api.list({ unreadOnly, cursor }),
    id: (item) => item.id,
    enabled: !!userId,
  });

  const unreadCount = query.data?.pages[0]?.unreadCount ?? 0;

  useEffect(() => {
    if (!userId) return;
    return api.subscribe(() => {
      void queryClient.invalidateQueries({ queryKey: notificationQueryKey });
    });
  }, [api, queryClient, notificationQueryKey, userId]);

  const markRead = useMutation({
    mutationFn: (id: string) => api.markRead(id),
    onSuccess: () => {
      setActionError(null);
      void queryClient.invalidateQueries({ queryKey: notificationQueryKey });
    },
    onError: () =>
      setActionError('Không thể cập nhật thông báo. Vui lòng thử lại.'),
  });
  const markAllRead = useMutation({
    mutationFn: () => api.markAllRead(),
    onSuccess: () => {
      setActionError(null);
      void queryClient.invalidateQueries({ queryKey: notificationQueryKey });
    },
    onError: () =>
      setActionError('Không thể cập nhật thông báo. Vui lòng thử lại.'),
  });

  return (
    <>
      <button
        type="button"
        aria-label="Thông báo"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
        className="relative min-h-11 rounded-lg px-3 text-sm font-medium text-slate-700 hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700"
      >
        <Bell size={22} aria-hidden="true" />
        {query.data && unreadCount > 0 ? (
          <span
            aria-label={`${unreadCount} thông báo chưa đọc`}
            className="absolute right-1 top-1 min-w-5 rounded-full bg-teal-700 px-1 text-center text-xs font-semibold leading-5 text-white"
          >
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        ) : null}
      </button>

      {open ? (
        <div className="fixed inset-0 z-40 bg-slate-950/30 sm:flex sm:justify-end">
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="notification-title"
            className="absolute inset-x-0 bottom-0 max-h-[85vh] overflow-hidden rounded-t-xl bg-white shadow-xl sm:inset-y-0 sm:left-auto sm:w-[28rem] sm:max-h-none sm:rounded-none"
          >
            <header className="flex min-h-16 items-center justify-between gap-3 border-b border-slate-200 px-5">
              <div>
                <h2
                  id="notification-title"
                  className="text-lg font-bold text-slate-950"
                >
                  Thông báo
                </h2>
                {query.data ? (
                  <p className="text-sm text-slate-600">
                    {unreadCount} thông báo chưa đọc
                  </p>
                ) : null}
              </div>
              <button
                type="button"
                aria-label="Đóng trung tâm thông báo"
                onClick={() => setOpen(false)}
                className="min-h-11 min-w-11 rounded-lg text-xl text-slate-500 hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700"
              >
                ×
              </button>
            </header>

            {query.data && unreadCount > 0 ? (
              <div className="border-b border-slate-200 px-5 py-2 text-right">
                <button
                  type="button"
                  disabled={markAllRead.isPending}
                  onClick={() => markAllRead.mutate()}
                  className="min-h-11 rounded-lg px-3 text-sm font-medium text-teal-800 hover:bg-teal-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 disabled:opacity-60"
                >
                  Đánh dấu tất cả đã đọc
                </button>
              </div>
            ) : null}

            <label className="flex min-h-11 items-center gap-2 px-5">
              <input
                type="checkbox"
                checked={unreadOnly}
                onChange={(event) => setUnreadOnly(event.target.checked)}
              />
              Chỉ chưa đọc
            </label>
            {actionError ? (
              <p
                role="alert"
                className="mx-5 mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800"
              >
                {actionError}
              </p>
            ) : null}

            <div className="max-h-[calc(85vh-4rem)] overflow-y-auto sm:max-h-[calc(100vh-4rem)]">
              {query.isPending ? (
                <div
                  data-testid="notification-loading"
                  className="min-h-40 animate-pulse space-y-3 p-5 motion-reduce:animate-none"
                >
                  <div className="h-4 w-2/3 rounded bg-slate-200" />
                  <div className="h-3 w-full rounded bg-slate-100" />
                  <div className="h-3 w-4/5 rounded bg-slate-100" />
                </div>
              ) : query.isError && !query.data ? (
                <div className="p-5">
                  <p role="alert" className="text-sm text-red-800">
                    Không thể tải thông báo. Vui lòng thử lại.
                  </p>
                  <button
                    type="button"
                    onClick={() => void query.refetch()}
                    className="mt-3 min-h-11 rounded-lg bg-teal-700 px-4 text-sm font-semibold text-white hover:bg-teal-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700"
                  >
                    Thử lại
                  </button>
                </div>
              ) : !query.data || query.items.length === 0 ? (
                <p className="p-5 text-sm text-slate-600">
                  Bạn chưa có thông báo.
                </p>
              ) : (
                <ul>
                  {query.items.map((notification) => (
                    <NotificationRow
                      key={notification.id}
                      notification={notification}
                      pending={markRead.isPending}
                      onMarkRead={(id) => markRead.mutate(id)}
                    />
                  ))}
                </ul>
              )}
              {query.data ? <ListPagination query={query} /> : null}
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}
