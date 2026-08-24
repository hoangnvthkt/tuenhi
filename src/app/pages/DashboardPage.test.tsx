import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { SessionContextValue } from '../../features/auth/session-store';
import { createReportsApi } from '../../features/reports/reports-api';
import { DashboardPage } from './DashboardPage';

vi.mock('../../features/reports/reports-api', () => ({
  createReportsApi: vi.fn(),
}));

const operational = {
  version: 1 as const,
  timezone: 'Asia/Ho_Chi_Minh' as const,
  catalog: {
    activeProductCount: 0,
    lowStockCount: 0,
    outOfStockCount: 0,
    totalOnHandQty: '0',
  },
  pending: { purchaseReceipts: 0, stockCounts: 0, saleReturns: 0 },
};
const revenue = {
  version: 1 as const,
  timezone: 'Asia/Ho_Chi_Minh' as const,
  range: { from: '2026-08-24', to: '2026-08-24' },
  generatedAt: '2026-08-24T01:00:00.000Z',
  scope: 'ALL' as const,
  summary: {
    completedOrderCount: 0,
    soldQuantity: '0',
    grossSales: '0',
    lineDiscounts: '0',
    orderDiscounts: '0',
    salesReturns: '0',
    cancellations: '0',
    netRevenue: '0',
    averageOrderValue: null,
  },
  daily: [],
  channels: [],
  paymentMethods: [],
};
const owner = {
  version: 1 as const,
  netRevenue: '0',
  netCogs: '0',
  grossProfit: '0',
  grossMarginPct: null,
  inventoryValue: '0',
};

function LocationProbe() {
  const location = useLocation();
  return <output aria-label="Địa chỉ hiện tại">{location.search}</output>;
}

function renderPage() {
  const api = {
    operational: vi.fn().mockResolvedValue(operational),
    mySummary: vi.fn().mockResolvedValue(revenue),
    revenue: vi.fn().mockResolvedValue(revenue),
    owner: vi.fn().mockResolvedValue(owner),
    profit: vi.fn(),
  };
  vi.mocked(createReportsApi).mockReturnValue(api);

  render(
    <QueryClientProvider
      client={
        new QueryClient({
          defaultOptions: {
            queries: { retry: false },
            mutations: { retry: false },
          },
        })
      }
    >
      <SessionContextValue.Provider
        value={{
          status: 'authenticated',
          session: {
            userId: '10000000-0000-4000-8000-000000000001',
            email: 'owner@example.invalid',
            displayName: 'Chủ cửa hàng',
            roleTemplate: 'OWNER',
            isActive: true,
            mustChangePassword: false,
            permissions: [
              'dashboard.operational.read',
              'report.all_revenue.read',
              'report.cost_profit.read',
            ],
          },
          errorMessage: null,
          refresh: vi.fn(),
          signIn: vi.fn(),
          changePassword: vi.fn(),
          signOut: vi.fn(),
        }}
      >
        <MemoryRouter initialEntries={['/']}>
          <DashboardPage />
          <LocationProbe />
        </MemoryRouter>
      </SessionContextValue.Provider>
    </QueryClientProvider>,
  );
  return api;
}

describe('DashboardPage', () => {
  it('keeps the selected period in the URL and manually refreshes all dashboard data', async () => {
    const user = userEvent.setup();
    const api = renderPage();

    expect(screen.getByRole('button', { name: 'Tuần này' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Tùy chọn' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Làm mới' })).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'Tuần này' }));
    await waitFor(() =>
      expect(screen.getByLabelText('Địa chỉ hiện tại')).toHaveTextContent(
        'period=week',
      ),
    );

    await waitFor(() => expect(api.operational).toHaveBeenCalledTimes(2));
    const callCountBeforeRefresh = api.operational.mock.calls.length;
    await user.click(screen.getByRole('button', { name: 'Làm mới' }));
    await waitFor(() =>
      expect(api.operational.mock.calls.length).toBeGreaterThan(
        callCountBeforeRefresh,
      ),
    );
    expect(screen.getByText(/Cập nhật lúc/)).toBeVisible();
  });

  it('keeps a custom inclusive date range in the URL', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole('button', { name: 'Tùy chọn' }));
    fireEvent.change(screen.getByLabelText('Từ ngày'), {
      target: { value: '2026-08-01' },
    });
    fireEvent.change(screen.getByLabelText('Đến ngày'), {
      target: { value: '2026-08-23' },
    });

    await waitFor(() =>
      expect(screen.getByLabelText('Địa chỉ hiện tại')).toHaveTextContent(
        'period=custom&from=2026-08-01&to=2026-08-23',
      ),
    );
  });
});
