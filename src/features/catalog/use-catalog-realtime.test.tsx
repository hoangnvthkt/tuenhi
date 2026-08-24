import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { SessionContextValue, type SessionValue } from '@/features/auth';
import {
  useCatalogRealtime,
  type CatalogRealtimeEvent,
  type CatalogRealtimeTransport,
} from './use-catalog-realtime';

const authenticated: SessionValue = {
  status: 'authenticated',
  session: {
    userId: '10000000-0000-4000-8000-000000000001',
    email: 'owner@example.invalid',
    displayName: 'Chủ cửa hàng',
    roleTemplate: 'OWNER',
    isActive: true,
    mustChangePassword: false,
    permissions: ['catalog.read'],
  },
  errorMessage: null,
  refresh: vi.fn(),
  signIn: vi.fn(),
  changePassword: vi.fn(),
  signOut: vi.fn(),
};

function Harness({ transport }: { transport: CatalogRealtimeTransport }) {
  const [online, setOnline] = useState(true);
  useCatalogRealtime({ transport, isOnline: online });
  return (
    <button type="button" onClick={() => setOnline((value) => !value)}>
      Đổi mạng
    </button>
  );
}

describe('useCatalogRealtime', () => {
  it('invalidates authoritative queries without merging payload data', async () => {
    let handler!: (event: CatalogRealtimeEvent) => void;
    const unsubscribe = vi.fn();
    const transport: CatalogRealtimeTransport = {
      subscribe: vi.fn((next) => {
        handler = next;
        return unsubscribe;
      }),
    };
    const queryClient = new QueryClient();
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
    const setData = vi.spyOn(queryClient, 'setQueryData');
    const view = render(
      <QueryClientProvider client={queryClient}>
        <SessionContextValue.Provider value={authenticated}>
          <Harness transport={transport} />
        </SessionContextValue.Provider>
      </QueryClientProvider>,
    );
    await waitFor(() => expect(transport.subscribe).toHaveBeenCalledOnce());
    act(() =>
      handler({
        table: 'product_images',
        new: { product_id: '10000000-0000-4000-8000-000000000002' },
        old: {},
      }),
    );
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['catalog'] });
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: ['catalog', 'detail', '10000000-0000-4000-8000-000000000002'],
    });
    expect(setData).not.toHaveBeenCalled();
    view.unmount();
    expect(unsubscribe).toHaveBeenCalledOnce();
  });

  it('does not subscribe anonymously and refetches after reconnect', async () => {
    const transport: CatalogRealtimeTransport = {
      subscribe: vi.fn(() => vi.fn()),
    };
    const queryClient = new QueryClient();
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
    const anonymous: SessionValue = {
      ...authenticated,
      status: 'anonymous',
      session: null,
    };
    const { rerender, getByRole } = render(
      <QueryClientProvider client={queryClient}>
        <SessionContextValue.Provider value={anonymous}>
          <Harness transport={transport} />
        </SessionContextValue.Provider>
      </QueryClientProvider>,
    );
    expect(transport.subscribe).not.toHaveBeenCalled();
    rerender(
      <QueryClientProvider client={queryClient}>
        <SessionContextValue.Provider value={authenticated}>
          <Harness transport={transport} />
        </SessionContextValue.Provider>
      </QueryClientProvider>,
    );
    await waitFor(() => expect(transport.subscribe).toHaveBeenCalledOnce());
    act(() => getByRole('button', { name: 'Đổi mạng' }).click());
    act(() => getByRole('button', { name: 'Đổi mạng' }).click());
    await waitFor(() =>
      expect(invalidate).toHaveBeenCalledWith({ queryKey: ['catalog'] }),
    );
  });
});
