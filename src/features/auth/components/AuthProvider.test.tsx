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

function wrapper(
  api: SessionApi,
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  }),
) {
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

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

it('clears private queries and ignores their late responses after external logout', async () => {
  const client = new QueryClient();
  const api = createApi();
  const { result } = renderHook(useSession, { wrapper: wrapper(api, client) });
  await waitFor(() => expect(result.current.status).toBe('authenticated'));
  client.setQueryData(['notifications', 'mine'], 'owner private data');
  const late = deferred<string>();
  const request = client
    .fetchQuery({ queryKey: ['reports'], queryFn: () => late.promise })
    .catch(() => undefined);
  vi.mocked(api.getAuthSession).mockResolvedValue(null);
  act(() => api.emitAuthChange());
  await waitFor(() => expect(result.current.status).toBe('anonymous'));
  expect(client.getQueryData(['notifications', 'mine'])).toBeUndefined();
  await act(async () => {
    late.resolve('owner revenue');
    await request;
  });
  expect(client.getQueryData(['reports'])).toBeUndefined();
});

it('never falls back to the previous profile when another Auth identity fails to load', async () => {
  const api = createApi();
  const { result } = renderHook(useSession, { wrapper: wrapper(api) });
  await waitFor(() => expect(result.current.status).toBe('authenticated'));
  vi.mocked(api.getAuthSession).mockResolvedValue({ userId: 'new-user' });
  vi.mocked(api.getSessionContext).mockRejectedValue(new Error('Offline'));
  await act(() => result.current.refresh());
  expect(result.current.status).toBe('error');
  expect(result.current.session).toBeNull();
});

it('hides the old profile and cache while the new profile is loading', async () => {
  const client = new QueryClient();
  const api = createApi();
  const { result } = renderHook(useSession, { wrapper: wrapper(api, client) });
  await waitFor(() => expect(result.current.status).toBe('authenticated'));
  client.setQueryData(['owner-dashboard'], 'revenue');
  const next = deferred<SessionContext>();
  vi.mocked(api.getAuthSession).mockResolvedValue({ userId: 'viewer' });
  vi.mocked(api.getSessionContext).mockReturnValue(next.promise);
  act(() => api.emitAuthChange());
  await waitFor(() => expect(api.getSessionContext).toHaveBeenCalledTimes(2));
  expect(result.current.session).toBeNull();
  expect(client.getQueryData(['owner-dashboard'])).toBeUndefined();
  await act(async () =>
    next.resolve({
      ...ownerSession,
      userId: 'viewer',
      roleTemplate: 'WAREHOUSE_VIEWER',
      permissions: ['catalog.read'],
    }),
  );
  expect(result.current.session?.roleTemplate).toBe('WAREHOUSE_VIEWER');
});

it('discards an old profile response after a newer identity refresh', async () => {
  const old = deferred<SessionContext>();
  const api = createApi({
    getSessionContext: vi
      .fn()
      .mockReturnValueOnce(old.promise)
      .mockResolvedValue({
        ...ownerSession,
        userId: 'new-user',
        roleTemplate: 'BUSINESS',
      }),
  });
  const { result } = renderHook(useSession, { wrapper: wrapper(api) });
  await waitFor(() => expect(api.getSessionContext).toHaveBeenCalledOnce());
  vi.mocked(api.getAuthSession).mockResolvedValue({ userId: 'new-user' });
  await act(() => result.current.refresh());
  await act(async () => old.resolve(ownerSession));
  expect(result.current.session?.userId).toBe('new-user');
});

it('rejects a profile that does not match the Auth identity', async () => {
  const api = createApi({
    getSessionContext: vi
      .fn()
      .mockResolvedValue({ ...ownerSession, userId: 'wrong-user' }),
  });
  const { result } = renderHook(useSession, { wrapper: wrapper(api) });
  await waitFor(() => expect(result.current.status).not.toBe('loading'));
  expect(result.current.session).toBeNull();
  expect(result.current.status).toBe('error');
});

it('keeps same-user caches on token refresh and clears them on explicit signout', async () => {
  const client = new QueryClient();
  const api = createApi();
  const { result } = renderHook(useSession, { wrapper: wrapper(api, client) });
  await waitFor(() => expect(result.current.status).toBe('authenticated'));
  client.setQueryData(['sale', 'draft'], 'unsaved view');
  await act(() => result.current.refresh());
  expect(client.getQueryData(['sale', 'draft'])).toBe('unsaved view');
  await act(() => result.current.signOut());
  expect(result.current.status).toBe('anonymous');
  expect(client.getQueryData(['sale', 'draft'])).toBeUndefined();
});
