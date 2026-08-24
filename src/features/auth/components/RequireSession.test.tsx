import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { AuthProvider } from './AuthProvider';
import { RequireSession } from './RequireSession';
import type { SessionApi, SessionContext } from '../model/session-context';

const session: SessionContext = {
  userId: '00000000-0000-4000-8000-000000000001',
  email: 'owner@example.com',
  displayName: 'Chủ cửa hàng',
  roleTemplate: 'OWNER',
  isActive: true,
  mustChangePassword: false,
  permissions: ['settings.manage'],
};

function createApi(
  authSession: { userId: string } | null,
  context: SessionContext = session,
): SessionApi {
  return {
    getAuthSession: vi.fn().mockResolvedValue(authSession),
    getSessionContext: vi.fn().mockResolvedValue(context),
    signIn: vi.fn().mockResolvedValue(undefined),
    changePassword: vi.fn().mockResolvedValue(undefined),
    signOut: vi.fn().mockResolvedValue(undefined),
    subscribe: vi.fn(() => () => undefined),
  };
}

async function renderGuard(
  api: SessionApi,
  permission?: string | string[],
  initialEntry = '/',
) {
  const router = createMemoryRouter(
    [
      { path: '/login', element: <p>Trang đăng nhập</p> },
      { path: '/change-password', element: <p>Trang đổi mật khẩu</p> },
      {
        path: '/',
        element: <RequireSession permission={permission} />,
        children: [{ index: true, element: <p>Nội dung bảo vệ</p> }],
      },
    ],
    { initialEntries: [initialEntry] },
  );

  render(
    <QueryClientProvider client={new QueryClient()}>
      <AuthProvider api={api}>
        <RouterProvider router={router} />
      </AuthProvider>
    </QueryClientProvider>,
  );

  return router;
}

describe('RequireSession', () => {
  it('shows a loading state before redirecting an anonymous user', async () => {
    const router = await renderGuard(createApi(null));

    expect(
      screen.getByText('Đang kiểm tra phiên đăng nhập…'),
    ).toBeInTheDocument();
    expect(await screen.findByText('Trang đăng nhập')).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/login');
  });

  it('renders the protected route for an active profile', async () => {
    await renderGuard(createApi({ userId: session.userId }));

    expect(await screen.findByText('Nội dung bảo vệ')).toBeInTheDocument();
  });

  it('forces a first-password change before protected routes', async () => {
    const router = await renderGuard(
      createApi(
        { userId: session.userId },
        { ...session, mustChangePassword: true, permissions: [] },
      ),
    );

    expect(await screen.findByText('Trang đổi mật khẩu')).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/change-password');
  });

  it('renders Vietnamese permission copy when permission is missing', async () => {
    await renderGuard(createApi({ userId: session.userId }), 'staff.manage');

    expect(
      await screen.findByText('Bạn không có quyền truy cập chức năng này.'),
    ).toBeInTheDocument();
  });

  it('accepts any one permission from an allowed list', async () => {
    await renderGuard(createApi({ userId: session.userId }), [
      'supplier.read',
      'settings.manage',
    ]);

    expect(await screen.findByText('Nội dung bảo vệ')).toBeInTheDocument();
  });
});
