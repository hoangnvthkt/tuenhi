import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { AuthProvider } from './AuthProvider';
import { LoginPage } from './LoginPage';
import type { SessionApi, SessionContext } from './session-context';

const session: SessionContext = {
  userId: '00000000-0000-4000-8000-000000000001',
  email: 'owner@example.com',
  displayName: 'Chủ cửa hàng',
  roleTemplate: 'OWNER',
  isActive: true,
  mustChangePassword: false,
  permissions: [],
};

function createApi(overrides: Partial<SessionApi> = {}): SessionApi {
  return {
    getAuthSession: vi.fn().mockResolvedValue(null),
    getSessionContext: vi.fn().mockResolvedValue(session),
    signIn: vi.fn().mockResolvedValue(undefined),
    changePassword: vi.fn().mockResolvedValue(undefined),
    signOut: vi.fn().mockResolvedValue(undefined),
    subscribe: vi.fn(() => () => undefined),
    ...overrides,
  };
}

function renderLogin(api: SessionApi) {
  const router = createMemoryRouter(
    [
      { path: '/login', element: <LoginPage /> },
      { path: '/', element: <p>Ứng dụng bán hàng</p> },
    ],
    { initialEntries: ['/login'] },
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

describe('LoginPage', () => {
  it('shows field-level Vietnamese validation', async () => {
    const user = userEvent.setup();
    renderLogin(createApi());

    await user.type(screen.getByLabelText('Email'), 'email-sai');
    await user.click(screen.getByRole('button', { name: 'Đăng nhập' }));

    expect(
      await screen.findByText('Email chưa đúng định dạng.'),
    ).toBeInTheDocument();
    expect(screen.getByText('Vui lòng nhập mật khẩu.')).toBeInTheDocument();
  });

  it('uses safe copy when credentials are rejected', async () => {
    const user = userEvent.setup();
    renderLogin(
      createApi({
        signIn: vi
          .fn()
          .mockRejectedValue(new Error('Email hoặc mật khẩu không đúng.')),
      }),
    );

    await user.type(screen.getByLabelText('Email'), 'owner@example.com');
    await user.type(screen.getByLabelText('Mật khẩu'), 'Matkhau123');
    await user.click(screen.getByRole('button', { name: 'Đăng nhập' }));

    expect(
      await screen.findByText('Email hoặc mật khẩu không đúng.'),
    ).toBeInTheDocument();
  });

  it('redirects to the application after a successful login', async () => {
    const user = userEvent.setup();
    const getAuthSession = vi
      .fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ userId: session.userId });
    const api = createApi({ getAuthSession });
    const router = renderLogin(api);

    await waitFor(() => expect(getAuthSession).toHaveBeenCalledOnce());
    await user.type(screen.getByLabelText('Email'), 'owner@example.com');
    await user.type(screen.getByLabelText('Mật khẩu'), 'Matkhau123');
    await user.click(screen.getByRole('button', { name: 'Đăng nhập' }));

    expect(await screen.findByText('Ứng dụng bán hàng')).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/');
  });
});
