import { fireEvent, screen, within } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router';
import { renderWithQueryClient } from '@/shared/testing/render-with-query-client';
import { ReportPage } from './ReportPage';
const mocks = vi.hoisted(() => ({
  profit: vi.fn(),
  owner: vi.fn(),
  revenue: vi.fn(),
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
    await screen.findByRole('button', { name: 'Tải thêm sự kiện' }),
  );
  await screen.findByText('HD51');
  expect(within(screen.getByRole('table')).getAllByRole('row')).toHaveLength(
    52,
  );
  expect(
    screen.queryByRole('button', { name: 'Tải thêm sự kiện' }),
  ).not.toBeInTheDocument();
  expect(mocks.profit).toHaveBeenCalledTimes(2);
  expect(mocks.owner).toHaveBeenCalledOnce();
});
