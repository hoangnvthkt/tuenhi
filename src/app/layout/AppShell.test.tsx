import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '@/features/auth';
import { ToastProvider } from '@/shared/ui/feedback/ToastProvider';
import type { SessionApi } from '@/features/auth';
import type { NotificationApi } from '@/features/notifications';
import { NotificationApiContext } from '@/features/notifications';
import { appRoutes } from '../app-routes';

const sessionApi: SessionApi = {
  getAuthSession: vi.fn().mockResolvedValue({
    userId: '00000000-0000-4000-8000-000000000001',
  }),
  getSessionContext: vi.fn().mockResolvedValue({
    userId: '00000000-0000-4000-8000-000000000001',
    email: 'owner@example.com',
    displayName: 'Chủ cửa hàng',
    roleTemplate: 'OWNER',
    isActive: true,
    mustChangePassword: false,
    permissions: [
      'dashboard.operational.read',
      'catalog.read',
      'sale.draft.manage',
      'sale.own.read',
    ],
  }),
  signIn: vi.fn().mockResolvedValue(undefined),
  changePassword: vi.fn().mockResolvedValue(undefined),
  signOut: vi.fn().mockResolvedValue(undefined),
  subscribe: vi.fn(() => () => undefined),
};

const notificationApi: NotificationApi = {
  list: vi
    .fn()
    .mockResolvedValue({ items: [], unreadCount: 0, nextCursor: null }),
  markRead: vi.fn().mockResolvedValue(undefined),
  markAllRead: vi.fn().mockResolvedValue(undefined),
  subscribe: vi.fn(() => () => undefined),
};

beforeAll(() => {
  vi.stubEnv('VITE_SUPABASE_URL', 'https://example.supabase.co');
  vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', 'test-publishable-key');
});

function renderAppRoute(initialEntry: string) {
  const router = createMemoryRouter(appRoutes, {
    initialEntries: [initialEntry],
  });

  render(
    <QueryClientProvider client={new QueryClient()}>
      <AuthProvider api={sessionApi}>
        <NotificationApiContext.Provider value={notificationApi}>
          <ToastProvider>
            <RouterProvider router={router} />
          </ToastProvider>
        </NotificationApiContext.Provider>
      </AuthProvider>
    </QueryClientProvider>,
  );
}

describe('AppShell', () => {
  it('renders the five required navigation destinations', async () => {
    renderAppRoute('/');

    expect(
      await screen.findByRole('heading', { name: 'Tổng quan' }),
    ).toBeInTheDocument();

    const mobileNavigation = screen.getByRole('navigation', {
      name: 'Điều hướng di động',
    });

    for (const label of [
      'Tổng quan',
      'Hàng hóa',
      'Bán hàng',
      'Hóa đơn',
      'Nhiều hơn',
    ]) {
      expect(
        within(mobileNavigation).getByRole('link', { name: label }),
      ).toBeInTheDocument();
    }
  });

  it('renders the POS page at /pos', async () => {
    renderAppRoute('/pos');

    expect(
      await screen.findByRole('heading', { name: 'Bán hàng' }),
    ).toBeInTheDocument();
  });

  it('renders the real product catalog at /products', async () => {
    renderAppRoute('/products');

    expect(
      await screen.findByRole('heading', { name: 'Hàng hóa' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(
        'Phân hệ Hàng hóa sẽ được kích hoạt trong giai đoạn đã được phê duyệt.',
      ),
    ).not.toBeInTheDocument();
  });
});
