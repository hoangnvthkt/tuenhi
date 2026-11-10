import { fireEvent, screen, within } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router';
import { renderWithQueryClient } from '@/shared/testing/render-with-query-client';
import { ReportPage } from './ReportPage';
const mocks = vi.hoisted(() => ({
  profit: vi.fn(),
  owner: vi.fn(),
  revenue: vi.fn(),
  topProducts: vi.fn(),
}));
vi.mock('../api/reports-api', () => ({
  createOwnerReportsApi: () => mocks,
  createRevenueReportsApi: () => mocks,
}));
vi.mock('@/features/auth', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/features/auth')>()),
  useSession: () => ({
    session: {
      permissions: ['report.cost_profit.read', 'report.all_revenue.read'],
    },
  }),
}));
it('stops at the last profit page without duplicating events or changing summary metrics', async () => {
  mocks.revenue.mockResolvedValue(null);
  mocks.owner.mockResolvedValue({
    netCogs: '100',
    grossProfit: '100',
    grossMarginPct: '50',
    inventoryValue: '1000',
  });
  const event = (n: number) => ({
    id: String(n),
    occurredAt: '2026-10-01T00:00:00Z',
    eventType: 'SALE_COMPLETED',
    saleNumber: `HD${n}`,
    saleId: '10000000-0000-4000-8000-000000000001',
    returnId: null,
    returnNumber: null,
    netRevenue: '10',
    netCogs: '5',
    grossProfit: '5',
  });
  mocks.profit
    .mockResolvedValueOnce({
      version: 1,
      items: Array.from({ length: 50 }, (_, i) => event(i + 1)),
      nextCursor: { occurredAt: '2026-10-01T00:00:00Z', id: '50' },
    })
    .mockResolvedValue({ version: 1, items: [event(51)], nextCursor: null });
  renderWithQueryClient(
    <MemoryRouter>
      <ReportPage />
    </MemoryRouter>,
  );
  fireEvent.click(
    await screen.findByRole('button', { name: /^Chi tiết từng đơn \(50\+\)/ }),
  );
  fireEvent.click(
    await screen.findByRole('button', { name: 'Tải thêm sự kiện' }),
  );
  await screen.findByText('HD51');
  expect(screen.getByRole('link', { name: 'HD51' })).toHaveAttribute(
    'href',
    '/sales/10000000-0000-4000-8000-000000000001',
  );
  expect(within(screen.getByRole('table')).getAllByRole('row')).toHaveLength(
    52,
  );
  expect(
    screen.queryByRole('button', { name: 'Tải thêm sự kiện' }),
  ).not.toBeInTheDocument();
  expect(mocks.profit).toHaveBeenCalledTimes(2);
  expect(mocks.owner).toHaveBeenCalledOnce();
});

it('reveals the linked profit section after its asynchronous data arrives', async () => {
  mocks.revenue.mockResolvedValue(null);
  mocks.owner.mockResolvedValue({
    netCogs: '0',
    grossProfit: '0',
    grossMarginPct: null,
    inventoryValue: '0',
  });
  mocks.profit
    .mockReset()
    .mockResolvedValue({ version: 1, items: [], nextCursor: null });
  const scroll = vi.fn();
  HTMLElement.prototype.scrollIntoView = scroll;
  renderWithQueryClient(
    <MemoryRouter
      initialEntries={[
        '/reports?period=today&from=2026-10-16&to=2026-10-16#profit',
      ]}
    >
      <ReportPage />
    </MemoryRouter>,
  );
  await screen.findByRole('table', { name: 'Chi tiết từng đơn' });
  expect(
    scroll.mock.contexts.some(
      (target) => target instanceof HTMLElement && target.id === 'profit',
    ),
  ).toBe(true);
});

it('draws revenue, deductions and top products with filtered links', async () => {
  const summary = {
    completedOrderCount: 2,
    soldQuantity: '3',
    grossSales: '251000',
    lineDiscounts: '31600',
    orderDiscounts: '0',
    salesReturns: '76400',
    cancellations: '0',
    netRevenue: '143000',
    averageOrderValue: '109700',
  };
  mocks.revenue.mockResolvedValue({
    version: 1,
    timezone: 'Asia/Ho_Chi_Minh',
    range: { from: '2026-11-09', to: '2026-11-10' },
    generatedAt: '2026-11-10T10:00:00Z',
    scope: 'ALL',
    summary,
    daily: [{ ...summary, day: '2026-11-10' }],
    channels: [
      {
        code: 'IN_STORE',
        name: 'Tại quầy',
        completedOrderCount: 2,
        grossSales: '251000',
        netRevenue: '143000',
      },
    ],
    paymentMethods: [
      {
        method: 'CASH',
        completedOrderCount: 2,
        grossSales: '251000',
        netRevenue: '143000',
      },
    ],
  });
  mocks.topProducts.mockResolvedValue({
    version: 1,
    range: { from: '2026-11-09', to: '2026-11-10' },
    scope: 'ALL',
    totalNetRevenue: '143000',
    items: [
      {
        productId: '30000000-0000-4000-8000-000000000001',
        productName: 'Ăn ngon đông trùng',
        unitName: 'Hộp',
        netRevenue: '85000',
        quantity: '1',
      },
      {
        productId: '30000000-0000-4000-8000-000000000002',
        productName: '12B Akopha Pháp',
        unitName: 'Hộp',
        netRevenue: '58000',
        quantity: '1',
      },
    ],
    otherNetRevenue: '0',
    otherProductCount: 0,
  });
  mocks.owner.mockResolvedValue({
    netCogs: '40000',
    grossProfit: '103000',
    grossMarginPct: '72.03',
    inventoryValue: '4000000',
  });
  mocks.profit
    .mockReset()
    .mockResolvedValue({ version: 1, items: [], nextCursor: null });
  renderWithQueryClient(
    <MemoryRouter
      initialEntries={['/reports?period=custom&from=2026-11-09&to=2026-11-10']}
    >
      <ReportPage />
    </MemoryRouter>,
  );
  expect((await screen.findAllByText('103.000 ₫')).length).toBeGreaterThan(0);
  expect(
    screen.getByRole('link', { name: '10/11: 143.000 ₫' }),
  ).toHaveAttribute(
    'href',
    '/reports/settlements?period=custom&from=2026-11-10&to=2026-11-10&scope=ALL&method=ALL',
  );
  const flow = screen.getByRole('region', { name: 'Tiền bán ra → Doanh thu' });
  expect(within(flow).getByText('−31.600 ₫')).toBeInTheDocument();
  expect(
    within(flow).getByRole('link', { name: 'Khách trả hàng' }),
  ).toHaveAttribute(
    'href',
    '/returns?status=COMPLETED&period=custom&from=2026-11-09&to=2026-11-10',
  );
  const top = await screen.findByRole('region', { name: 'Bán chạy' });
  const first = within(top).getByRole('link', {
    name: /1\. Ăn ngon đông trùng/,
  });
  expect(first).toHaveTextContent('1 Hộp · 59%');
  expect(first).toHaveAttribute(
    'href',
    '/reports/settlements?period=custom&from=2026-11-09&to=2026-11-10&scope=ALL&method=ALL&product=30000000-0000-4000-8000-000000000001',
  );
  expect(screen.getByText('Hàng trong kho (giá vốn)')).toBeInTheDocument();
  expect(screen.getByText('4.000.000 ₫')).toBeInTheDocument();
  expect(screen.queryByText('Doanh thu gộp')).not.toBeInTheDocument();
});
