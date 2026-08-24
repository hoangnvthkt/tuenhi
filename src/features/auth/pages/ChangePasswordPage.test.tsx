import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '../components/AuthProvider';
import { ChangePasswordPage } from './ChangePasswordPage';
import type { SessionApi, SessionContext } from '../model/session-context';

const mustChangeSession: SessionContext = {
  userId: '00000000-0000-4000-8000-000000000001',
  email: 'owner@example.com',
  displayName: 'Chủ cửa hàng',
  roleTemplate: 'OWNER',
  isActive: true,
  mustChangePassword: true,
  permissions: [],
};

function createApi(overrides: Partial<SessionApi> = {}): SessionApi {
  return {
    getAuthSession: vi
      .fn()
      .mockResolvedValue({ userId: mustChangeSession.userId }),
    getSessionContext: vi.fn().mockResolvedValue(mustChangeSession),
    signIn: vi.fn().mockResolvedValue(undefined),
    changePassword: vi.fn().mockResolvedValue(undefined),
    signOut: vi.fn().mockResolvedValue(undefined),
    subscribe: vi.fn(() => () => undefined),
    ...overrides,
  };
}

function renderPage(api: SessionApi) {
  const router = createMemoryRouter(
    [
      { path: '/change-password', element: <ChangePasswordPage /> },
      { path: '/', element: <p>Ứng dụng bán hàng</p> },
    ],
    { initialEntries: ['/change-password'] },
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

describe('ChangePasswordPage', () => {
  it('requires the approved password policy and matching confirmation', async () => {
    const user = userEvent.setup();
    renderPage(createApi());

    await user.type(screen.getByLabelText('Mật khẩu mới'), 'matkhaumoi');
    await user.type(
      screen.getByLabelText('Nhập lại mật khẩu mới'),
      'khongkhop',
    );
    await user.click(screen.getByRole('button', { name: 'Đổi mật khẩu' }));

    expect(
      await screen.findByText(
        'Mật khẩu phải có ít nhất 10 ký tự, gồm chữ thường, chữ hoa và số.',
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Mật khẩu nhập lại chưa khớp.'),
    ).toBeInTheDocument();
  });

  it('refreshes the session and enters the application after success', async () => {
    const user = userEvent.setup();
    const getSessionContext = vi
      .fn()
      .mockResolvedValueOnce(mustChangeSession)
      .mockResolvedValueOnce({
        ...mustChangeSession,
        mustChangePassword: false,
      });
    const changePassword = vi.fn().mockResolvedValue(undefined);
    const api = createApi({ getSessionContext, changePassword });
    const router = renderPage(api);

    await waitFor(() => expect(getSessionContext).toHaveBeenCalledOnce());
    await user.type(screen.getByLabelText('Mật khẩu mới'), 'Matkhaumoi1');
    await user.type(
      screen.getByLabelText('Nhập lại mật khẩu mới'),
      'Matkhaumoi1',
    );
    await user.click(screen.getByRole('button', { name: 'Đổi mật khẩu' }));

    expect(await screen.findByText('Ứng dụng bán hàng')).toBeInTheDocument();
    expect(changePassword).toHaveBeenCalledWith('Matkhaumoi1', true);
    expect(router.state.location.pathname).toBe('/');
  });
});
