import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { SessionApi, SessionContext } from '../model/session-context';
import { AuthProvider } from './AuthProvider';
import { useSession } from '../hooks/use-session';

const ownerSession: SessionContext = {
  userId: '00000000-0000-4000-8000-000000000001',
  email: 'owner@example.com',
  displayName: 'Chủ cửa hàng',
  roleTemplate: 'OWNER',
  isActive: true,
  mustChangePassword: false,
  permissions: ['settings.manage'],
};

function createApi(
  overrides: Partial<SessionApi> = {},
): SessionApi & { emitAuthChange: () => void } {
  let listener = () => undefined;

  return {
    getAuthSession: vi.fn().mockResolvedValue({ userId: ownerSession.userId }),
    getSessionContext: vi.fn().mockResolvedValue(ownerSession),
    signIn: vi.fn().mockResolvedValue(undefined),
    changePassword: vi.fn().mockResolvedValue(undefined),
    signOut: vi.fn().mockResolvedValue(undefined),
    subscribe: vi.fn((nextListener) => {
      listener = nextListener;
      return () => undefined;
    }),
    emitAuthChange: () => listener(),
    ...overrides,
  };
}

function wrapper(api: SessionApi) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return function TestWrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <AuthProvider api={api}>{children}</AuthProvider>
      </QueryClientProvider>
    );
  };
}

describe('AuthProvider', () => {
  it('loads the authoritative profile after finding an Auth session', async () => {
    const api = createApi();
    const { result } = renderHook(useSession, { wrapper: wrapper(api) });

    expect(result.current.status).toBe('loading');

    await waitFor(() => expect(result.current.status).toBe('authenticated'));
    expect(result.current.session).toEqual(ownerSession);
  });

  it('clears the session when Auth reports a logout', async () => {
    const getAuthSession = vi
      .fn()
      .mockResolvedValueOnce({ userId: ownerSession.userId })
      .mockResolvedValueOnce(null);
    const api = createApi({ getAuthSession });
    const { result } = renderHook(useSession, { wrapper: wrapper(api) });

    await waitFor(() => expect(result.current.status).toBe('authenticated'));
    act(() => api.emitAuthChange());
    await waitFor(() => expect(result.current.status).toBe('anonymous'));
  });

  it('signs out an inactive profile and exposes safe Vietnamese copy', async () => {
    const signOut = vi.fn().mockResolvedValue(undefined);
    const api = createApi({
      signOut,
      getSessionContext: vi
        .fn()
        .mockResolvedValue({ ...ownerSession, isActive: false }),
    });
    const { result } = renderHook(useSession, { wrapper: wrapper(api) });

    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.errorMessage).toBe('Tài khoản đã bị khóa.');
    expect(signOut).toHaveBeenCalledOnce();
  });

  it('signs out when the authoritative session RPC rejects an inactive account', async () => {
    const signOut = vi.fn().mockResolvedValue(undefined);
    const api = createApi({
      signOut,
      getSessionContext: vi
        .fn()
        .mockRejectedValue(new Error('Tài khoản đã bị khóa.')),
    });
    const { result } = renderHook(useSession, { wrapper: wrapper(api) });

    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.errorMessage).toBe('Tài khoản đã bị khóa.');
    expect(signOut).toHaveBeenCalledOnce();
  });

  it('keeps the last authenticated session on a transient offline refresh failure', async () => {
    const getSessionContext = vi
      .fn()
      .mockResolvedValueOnce(ownerSession)
      .mockRejectedValueOnce(
        new Error('Không thể tải thông tin tài khoản. Vui lòng thử lại.'),
      );
    const api = createApi({ getSessionContext });
    const { result } = renderHook(useSession, { wrapper: wrapper(api) });

    await waitFor(() => expect(result.current.status).toBe('authenticated'));
    act(() => api.emitAuthChange());
    await waitFor(() => expect(getSessionContext).toHaveBeenCalledTimes(2));
    expect(result.current.status).toBe('authenticated');
    expect(result.current.session).toEqual(ownerSession);
    expect(api.signOut).not.toHaveBeenCalled();
  });
});
