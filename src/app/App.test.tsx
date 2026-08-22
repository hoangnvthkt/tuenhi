import { render, screen } from '@testing-library/react';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { SessionApi } from '../features/auth/session-context';
import type { NotificationApi } from '../features/notifications/notification-api';
import { App } from './App';

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
    permissions: [],
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

describe('App', () => {
  it('renders the Tuệ Nhi product identity', async () => {
    render(<App sessionApi={sessionApi} notificationApi={notificationApi} />);

    expect(await screen.findByText('Tuệ Nhi')).toBeInTheDocument();
  });
});
