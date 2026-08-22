import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import {
  NotificationCenter,
  type NotificationApi,
  type NotificationFeed,
} from './NotificationCenter';

const unreadFeed: NotificationFeed = {
  unreadCount: 1,
  nextCursor: null,
  items: [
    {
      id: '00000000-0000-4000-8000-000000000010',
      severity: 'INFO',
      category: 'ACCOUNT',
      title: 'Mật khẩu đã được cập nhật',
      message: 'Tài khoản của bạn đã sẵn sàng sử dụng.',
      actionRoute: null,
      entityType: null,
      entityId: null,
      correlationId: '00000000-0000-4000-8000-000000000011',
      readAt: null,
      createdAt: '2026-08-22T04:00:00.000Z',
    },
  ],
};

function createApi(overrides: Partial<NotificationApi> = {}): NotificationApi {
  return {
    list: vi.fn().mockResolvedValue(unreadFeed),
    markRead: vi.fn().mockResolvedValue(undefined),
    markAllRead: vi.fn().mockResolvedValue(undefined),
    subscribe: vi.fn(() => () => undefined),
    ...overrides,
  };
}

function renderCenter(api: NotificationApi) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={queryClient}>
      <NotificationCenter api={api} />
    </QueryClientProvider>,
  );
}

describe('NotificationCenter', () => {
  it('shows the unread badge and opens an accessible notification dialog', async () => {
    const user = userEvent.setup();
    renderCenter(createApi());

    expect(
      await screen.findByLabelText('1 thông báo chưa đọc'),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Thông báo' }));

    expect(
      screen.getByRole('dialog', { name: 'Thông báo' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Mật khẩu đã được cập nhật')).toBeInTheDocument();
  });

  it('renders a stable loading skeleton and the approved empty copy', async () => {
    const user = userEvent.setup();
    let resolveFeed!: (feed: NotificationFeed) => void;
    const list = vi.fn(
      () =>
        new Promise<NotificationFeed>((resolve) => {
          resolveFeed = resolve;
        }),
    );
    renderCenter(createApi({ list }));

    await user.click(screen.getByRole('button', { name: 'Thông báo' }));
    expect(screen.getByTestId('notification-loading')).toHaveClass('min-h-40');

    resolveFeed({ items: [], unreadCount: 0, nextCursor: null });
    expect(
      await screen.findByText('Bạn chưa có thông báo.'),
    ).toBeInTheDocument();
  });

  it('shows Vietnamese error copy and retries', async () => {
    const user = userEvent.setup();
    const list = vi
      .fn()
      .mockRejectedValueOnce(new Error('raw database detail'))
      .mockResolvedValueOnce({ items: [], unreadCount: 0, nextCursor: null });
    renderCenter(createApi({ list }));

    await user.click(screen.getByRole('button', { name: 'Thông báo' }));
    expect(
      await screen.findByText('Không thể tải thông báo. Vui lòng thử lại.'),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Thử lại' }));

    expect(
      await screen.findByText('Bạn chưa có thông báo.'),
    ).toBeInTheDocument();
    expect(list).toHaveBeenCalledTimes(2);
  });

  it('marks one notification and all notifications as read', async () => {
    const user = userEvent.setup();
    const markRead = vi.fn().mockResolvedValue(undefined);
    const markAllRead = vi.fn().mockResolvedValue(undefined);
    renderCenter(createApi({ markRead, markAllRead }));

    await user.click(screen.getByRole('button', { name: 'Thông báo' }));
    await screen.findByText('Mật khẩu đã được cập nhật');
    await user.click(
      screen.getByRole('button', {
        name: 'Đánh dấu đã đọc: Mật khẩu đã được cập nhật',
      }),
    );
    await waitFor(() =>
      expect(markRead).toHaveBeenCalledWith(
        '00000000-0000-4000-8000-000000000010',
      ),
    );
    await user.click(
      screen.getByRole('button', { name: 'Đánh dấu tất cả đã đọc' }),
    );
    await waitFor(() => expect(markAllRead).toHaveBeenCalledOnce());
  });

  it('invalidates the query on Realtime events instead of trusting the payload', async () => {
    let realtimeListener = () => undefined;
    const list = vi.fn().mockResolvedValue(unreadFeed);
    const api = createApi({
      list,
      subscribe: vi.fn((listener) => {
        realtimeListener = listener;
        return () => undefined;
      }),
    });
    renderCenter(api);

    await waitFor(() => expect(list).toHaveBeenCalledOnce());
    realtimeListener();
    await waitFor(() => expect(list).toHaveBeenCalledTimes(2));
  });
});
