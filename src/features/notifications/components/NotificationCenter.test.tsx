import { SessionContextValue, type SessionValue } from '@/features/auth';
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

function authValue(userId: string | null): SessionValue {
  return {
    status: userId ? 'authenticated' : 'anonymous',
    session: userId
      ? {
          userId,
          email: 'test@example.com',
          displayName: userId,
          roleTemplate: 'OWNER',
          isActive: true,
          mustChangePassword: false,
          permissions: [],
        }
      : null,
    errorMessage: null,
    refresh: vi.fn(),
    signIn: vi.fn(),
    signOut: vi.fn(),
    changePassword: vi.fn(),
  };
}
function renderCenter(api: NotificationApi) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={queryClient}>
      <SessionContextValue.Provider value={authValue('owner')}>
        <NotificationCenter api={api} />
      </SessionContextValue.Provider>
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

it('does not fetch notifications without a known identity', async () => {
  const api = createApi();
  render(
    <QueryClientProvider client={new QueryClient()}>
      <SessionContextValue.Provider value={authValue(null)}>
        <NotificationCenter api={api} />
      </SessionContextValue.Provider>
    </QueryClientProvider>,
  );
  await new Promise((resolve) => setTimeout(resolve, 20));
  expect(api.list).not.toHaveBeenCalled();
});

it('does not reuse fresh owner notifications for another account', async () => {
  const api = createApi();
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 30000 } },
  });
  const view = (id: string) => (
    <QueryClientProvider client={client}>
      <SessionContextValue.Provider value={authValue(id)}>
        <NotificationCenter api={api} />
      </SessionContextValue.Provider>
    </QueryClientProvider>
  );
  const { rerender } = render(view('owner'));
  await screen.findByLabelText('1 thông báo chưa đọc');
  vi.mocked(api.list).mockResolvedValue({
    items: [],
    unreadCount: 0,
    nextCursor: null,
  });
  rerender(view('viewer'));
  await userEvent
    .setup()
    .click(screen.getByRole('button', { name: 'Thông báo' }));
  await screen.findByText('Bạn chưa có thông báo.');
  expect(
    screen.queryByText('Mật khẩu đã được cập nhật'),
  ).not.toBeInTheDocument();
});

it('loads the next notifications and switches to unread without marking all read', async () => {
  const user = userEvent.setup();
  const cursor = {
    createdAt: unreadFeed.items[0]!.createdAt,
    id: unreadFeed.items[0]!.id,
  };
  const list = vi.fn().mockImplementation(({ cursor: next, unreadOnly }) =>
    Promise.resolve(
      unreadOnly
        ? { ...unreadFeed, items: [], nextCursor: null }
        : next
          ? {
              ...unreadFeed,
              items: [
                { ...unreadFeed.items[0], id: '51', title: 'Thông báo 51' },
              ],
            }
          : { ...unreadFeed, nextCursor: cursor },
    ),
  );
  const api = createApi({ list });
  renderCenter(api);
  await user.click(screen.getByRole('button', { name: 'Thông báo' }));
  await user.click(await screen.findByRole('button', { name: 'Tải thêm' }));
  await screen.findByText('Thông báo 51');
  expect(
    screen.queryByRole('button', { name: 'Tải thêm' }),
  ).not.toBeInTheDocument();
  await user.click(screen.getByLabelText('Chỉ chưa đọc'));
  await screen.findByText('Bạn chưa có thông báo.');
  expect(list).toHaveBeenLastCalledWith({
    unreadOnly: true,
    cursor: undefined,
  });
  expect(api.markAllRead).not.toHaveBeenCalled();
});
