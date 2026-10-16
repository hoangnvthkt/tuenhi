import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { expect, it, vi } from 'vitest';
import { SettlementReportPage } from './SettlementReportPage';
import { createSaleSettlementsApi } from '../api/settlements-api';
const access = vi.hoisted(() => ({ all: true }));
vi.mock('@/features/auth', () => ({
  useSession: () => ({
    session: {
      permissions: access.all
        ? ['report.all_revenue.read']
        : ['report.own_revenue.read'],
    },
  }),
  usePrivateQueryKey:
    () =>
    (...parts: unknown[]) =>
      parts,
}));
vi.mock('../api/settlements-api', async (original) => ({
  ...(await original<typeof import('../api/settlements-api')>()),
  createSaleSettlementsApi: vi.fn(),
}));
it('shows a filtered invoice with its current payments and keeps date/scope on method navigation', async () => {
  const report = vi.fn().mockResolvedValue({
    version: 1,
    range: { from: '2026-10-16', to: '2026-10-16' },
    scope: 'ALL',
    summary: {
      cashAmount: '45000',
      bankTransferAmount: '10000',
      outstandingAmount: '0',
    },
    items: [
      {
        id: '10000000-0000-4000-8000-000000000001',
        saleNumber: 'HD000004',
        completedAt: '2026-10-16T01:00:00Z',
        customerName: null,
        status: 'COMPLETED',
        cashAmount: '45000',
        bankTransferAmount: '10000',
        outstandingAmount: '0',
      },
    ],
    nextCursor: null,
  });
  vi.mocked(createSaleSettlementsApi).mockReturnValue({ report });
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <MemoryRouter
        initialEntries={[
          '/reports/settlements?period=today&from=2026-10-16&to=2026-10-16&scope=ALL&method=CASH',
        ]}
      >
        <SettlementReportPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  expect(await screen.findByRole('link', { name: 'HD000004' })).toHaveAttribute(
    'href',
    '/sales/10000000-0000-4000-8000-000000000001',
  );
  expect(report).toHaveBeenCalledWith(
    '2026-10-16',
    '2026-10-16',
    'ALL',
    'CASH',
    undefined,
  );
  expect(
    screen.getByRole('heading', { name: 'Tiền mặt từ các đơn bán' }),
  ).toBeVisible();
  expect(screen.getByRole('link', { name: 'Về tổng quan' })).toHaveAttribute(
    'href',
    '/?period=today&from=2026-10-16&to=2026-10-16',
  );
  await userEvent.click(screen.getByRole('link', { name: 'Nợ còn lại' }));
  expect(
    await screen.findByRole('heading', { name: 'Nợ còn lại của các đơn bán' }),
  ).toBeVisible();
  expect(report).toHaveBeenLastCalledWith(
    '2026-10-16',
    '2026-10-16',
    'ALL',
    'DEBT',
    undefined,
  );
});

it('reduces a forged ALL scope to OWN for a staff report', async () => {
  access.all = false;
  const report = vi.fn().mockResolvedValue({
    version: 1,
    range: { from: '2026-10-16', to: '2026-10-16' },
    scope: 'OWN',
    summary: {
      cashAmount: '0',
      bankTransferAmount: '0',
      outstandingAmount: '0',
    },
    items: [],
    nextCursor: null,
  });
  vi.mocked(createSaleSettlementsApi).mockReturnValue({ report });
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <MemoryRouter
        initialEntries={[
          '/reports/settlements?from=2026-10-16&to=2026-10-16&scope=ALL&method=DEBT',
        ]}
      >
        <SettlementReportPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  expect(
    await screen.findByText('Không có hóa đơn phù hợp với bộ lọc.'),
  ).toBeVisible();
  expect(report).toHaveBeenCalledWith(
    '2026-10-16',
    '2026-10-16',
    'OWN',
    'DEBT',
    undefined,
  );
  access.all = true;
});
