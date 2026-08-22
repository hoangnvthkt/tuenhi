import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '../../features/auth/AuthProvider';
import type { SessionApi } from '../../features/auth/session-context';
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
    permissions: [],
  }),
  signIn: vi.fn().mockResolvedValue(undefined),
  changePassword: vi.fn().mockResolvedValue(undefined),
  signOut: vi.fn().mockResolvedValue(undefined),
  subscribe: vi.fn(() => () => undefined),
};

function renderAppRoute(initialEntry: string) {
  const router = createMemoryRouter(appRoutes, {
    initialEntries: [initialEntry],
  });

  render(
    <QueryClientProvider client={new QueryClient()}>
      <AuthProvider api={sessionApi}>
        <RouterProvider router={router} />
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

  it('renders the sales foundation page at /pos', async () => {
    renderAppRoute('/pos');

    expect(
      await screen.findByRole('heading', { name: 'Bán hàng' }),
    ).toBeInTheDocument();
  });
});
