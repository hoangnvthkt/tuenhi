import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { SessionContextValue } from '@/features/auth';
import {
  createSaleSettlementsApi,
  createOwnerReportsApi,
  createRevenueReportsApi,
} from '@/features/reports';
import { DashboardPage } from './DashboardPage';

vi.mock('@/features/reports', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/features/reports')>()),
  createSaleSettlementsApi: vi.fn(),
  createOwnerReportsApi: vi.fn(),
  createRevenueReportsApi: vi.fn(),
}));

const operational = {
  version: 1 as const,
  timezone: 'Asia/Ho_Chi_Minh' as const,
  catalog: {
    activeProductCount: 1102,
    lowStockCount: 2,
    outOfStockCount: 1100,
    totalOnHandQty: '101',
    stockStates: {
      inStock: 1,
      runningLow: 1,
      zeroStock: 1099,
      negativeStock: 1,
    },
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
  netRevenue: '397000',
  netCogs: '160000',
  grossProfit: '237000',
  grossMarginPct: '59.70',
  inventoryValue: '4040000',
};
const productRevenue = {
  version: 1 as const,
  range: { from: '2026-10-01', to: '2026-10-31' },
  scope: 'ALL' as const,
  totalNetRevenue: '397000',
  items: [
    {
      productId: '30000001-0000-4000-8000-000000000001',
      productName: '12B Akopha Pháp',
      netRevenue: '232000',
    },
    {
      productId: '30000002-0000-4000-8000-000000000001',
      productName: '12B Linh Chi',
      netRevenue: '150000',
    },
    {
      productId: '30000003-0000-4000-8000-000000000001',
      productName: 'Vitamin C',
      netRevenue: '10000',
    },
  ],
  otherNetRevenue: '5000',
  otherProductCount: 2,
};

function LocationProbe() {
  const location = useLocation();
  return <output aria-label="Địa chỉ hiện tại">{location.search}</output>;
}

function renderPage(
  permissions: string[] = [
    'dashboard.operational.read',
    'report.all_revenue.read',
    'report.cost_profit.read',
  ],
  { pendingOperational = false } = {},
) {
  const settlements = vi.fn().mockResolvedValue({
    version: 1,
    range: { from: '2026-10-16', to: '2026-10-16' },
    scope: 'ALL',
    summary: {
      cashAmount: '45000',
      bankTransferAmount: '10000',
      outstandingAmount: '20000',
    },
    items: [],
    nextCursor: null,
  });
  vi.mocked(createSaleSettlementsApi).mockReturnValue({ report: settlements });
  const api = {
    operational: pendingOperational
      ? vi.fn().mockReturnValue(new Promise(() => {}))
      : vi.fn().mockResolvedValue(operational),
    mySummary: vi.fn().mockResolvedValue(revenue),
    revenue: vi.fn().mockResolvedValue(revenue),
    productRevenue: vi.fn().mockResolvedValue(productRevenue),
    owner: vi.fn().mockResolvedValue(owner),
    profit: vi.fn(),
  };
  vi.mocked(createRevenueReportsApi).mockReturnValue({
    operational: api.operational,
    mySummary: api.mySummary,
    revenue: api.revenue,
    productRevenue: api.productRevenue,
    topProducts: vi.fn(),
  });
  vi.mocked(createOwnerReportsApi).mockReturnValue({
    owner: api.owner,
    profit: api.profit,
  });

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
            permissions,
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
  it('groups each metric as a labelled summary with a decorative icon', async () => {
    renderPage();

    const metric = await screen.findByRole('article', {
      name: 'Doanh thu thuần',
    });
    expect(metric).toHaveTextContent('Doanh thu thuần');
    expect(metric.querySelector('svg[aria-hidden="true"]')).not.toBeNull();
  });

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

it('does not request or offer revenue reports without revenue permission, including refresh', async () => {
  const api = renderPage([
    'dashboard.operational.read',
    'catalog.read',
    'inventory.read',
  ]);
  expect(
    await screen.findByRole('link', { name: 'Hết hàng: 1.099 (100%)' }),
  ).toBeVisible();
  expect(
    screen.queryByRole('link', { name: 'Xem báo cáo' }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole('article', { name: 'Thu tiền các đơn' }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole('article', { name: 'Doanh thu thuần' }),
  ).not.toBeInTheDocument();
  expect(api.mySummary).not.toHaveBeenCalled();
  expect(api.revenue).not.toHaveBeenCalled();
  expect(api.productRevenue).not.toHaveBeenCalled();
  expect(api.owner).not.toHaveBeenCalled();
  await userEvent.click(screen.getByRole('button', { name: 'Làm mới' }));
  expect(api.mySummary).not.toHaveBeenCalled();
  expect(api.revenue).not.toHaveBeenCalled();
  expect(api.productRevenue).not.toHaveBeenCalled();
});

function linkUrl(name: string) {
  const href = screen.getByRole('link', { name }).getAttribute('href')!;
  return new URL(href, 'https://local.invalid');
}

it('shows exact cash, transfer and remaining debt slices that open the filtered settlement list', async () => {
  renderPage();
  await screen.findByRole('link', { name: 'Tiền mặt: 45.000 ₫ (60%)' });
  const chart = screen.getByRole('article', { name: 'Thu tiền các đơn' });
  expect(chart).toHaveTextContent('75.000 ₫');
  for (const [label, method] of [
    ['Tiền mặt: 45.000 ₫ (60%)', 'CASH'],
    ['Chuyển khoản: 10.000 ₫ (13%)', 'BANK_TRANSFER'],
    ['Còn nợ: 20.000 ₫ (27%)', 'DEBT'],
  ] as const) {
    const url = linkUrl(label);
    expect(url.pathname).toBe('/reports/settlements');
    expect(url.searchParams.get('method')).toBe(method);
    expect(url.searchParams.get('period')).toBe('today');
    expect(url.searchParams.get('scope')).toBe('ALL');
    expect(url.searchParams.get('from')).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  }
  expect(chart.querySelectorAll('circle[data-slice]')).toHaveLength(3);
});

it('links every stock state to the matching product filter', async () => {
  renderPage();
  await screen.findByRole('link', { name: 'Hết hàng: 1.099 (100%)' });
  const chart = screen.getByRole('article', { name: 'Tình trạng hàng' });
  expect(chart).toHaveTextContent('1.102');
  for (const [label, state] of [
    ['Đủ hàng: 1 (<1%)', 'IN_STOCK'],
    ['Sắp hết: 1 (<1%)', 'RUNNING_LOW'],
    ['Âm kho: 1 (<1%)', 'NEGATIVE_STOCK'],
    ['Hết hàng: 1.099 (100%)', 'ZERO_STOCK'],
  ] as const) {
    expect(screen.getByRole('link', { name: label })).toHaveAttribute(
      'href',
      `/products?stock=${state}`,
    );
  }
});

it('links each product slice to the invoices that sold it', async () => {
  renderPage();
  await screen.findByRole('link', { name: /^12B Akopha Pháp/ });
  const chart = screen.getByRole('article', {
    name: 'Doanh thu theo sản phẩm',
  });
  expect(chart).toHaveTextContent('397.000 ₫');
  expect(
    linkUrl('12B Akopha Pháp: 232.000 ₫ (58%)').searchParams.get('product'),
  ).toBe('30000001-0000-4000-8000-000000000001');
  const other = linkUrl('Khác (2 sản phẩm): 5.000 ₫ (1%)');
  expect(other.pathname).toBe('/reports/settlements');
  expect(other.searchParams.get('product')).toBeNull();
  expect(chart.querySelectorAll('circle[data-slice]')).toHaveLength(4);
});

it('links KPI and pending numbers to filtered source lists', async () => {
  renderPage();
  await screen.findByRole('article', { name: 'Tình trạng hàng' });
  await waitFor(() =>
    expect(
      screen.getByRole('article', { name: 'Lợi nhuận gộp' }),
    ).toHaveTextContent('Giá vốn 160.000 ₫'),
  );
  expect(
    screen.getByRole('article', { name: 'Giá trị tồn' }),
  ).toHaveTextContent('4.040.000 ₫101 đơn vị');
  expect(linkUrl('Doanh thu thuần').searchParams.get('method')).toBe('ALL');
  const returns = linkUrl('Trả hàng');
  expect(returns.pathname).toBe('/returns');
  expect(returns.searchParams.get('status')).toBe('COMPLETED');
  expect(returns.searchParams.get('from')).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  expect(linkUrl('Lợi nhuận gộp').hash).toBe('#profit');
  expect(screen.getByRole('link', { name: 'Giá trị tồn' })).toHaveAttribute(
    'href',
    '/more/inventory/valuation',
  );
  expect(
    screen.getByRole('link', { name: 'Phiếu nhập chờ xử lý' }),
  ).toHaveAttribute('href', '/more/purchases?status=AWAITING_COST');
  expect(
    screen.getByRole('link', { name: 'Kiểm kho chờ xử lý' }),
  ).toHaveAttribute('href', '/stock-counts?status=COUNTED');
  expect(
    screen.getByRole('link', { name: 'Trả hàng chờ xử lý' }),
  ).toHaveAttribute('href', '/returns?status=REQUESTED');
});

it('shows loading placeholders instead of zero while stock data is pending', async () => {
  renderPage(undefined, { pendingOperational: true });
  expect(
    await screen.findByRole('status', { name: 'Đang tải tình trạng hàng' }),
  ).toBeVisible();
  expect(
    screen.getByRole('status', { name: 'Đang tải phiếu nhập chờ xử lý' }),
  ).toBeVisible();
  expect(
    screen.getByRole('article', { name: 'Phiếu nhập chờ xử lý' }),
  ).not.toHaveTextContent('0');
});
