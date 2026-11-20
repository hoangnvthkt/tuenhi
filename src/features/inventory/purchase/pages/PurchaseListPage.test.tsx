import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { expect, it, vi } from 'vitest';
import { PurchaseListPage } from './PurchaseListPage';

const list = vi.hoisted(() => vi.fn());
vi.mock('@/features/auth', () => ({
  usePrivateQueryKey:
    () =>
    (...parts: unknown[]) =>
      parts,
  useSession: () => ({ session: { permissions: [] } }),
}));
vi.mock('../api/purchase-api', () => ({ createPurchaseApi: () => ({ list }) }));

const receipt = (id: string, receivedAt: string) => ({
  id,
  receiptNumber: `PN${id}`,
  status: 'POSTED',
  supplierId: null,
  supplierName: 'Việt Pháp',
  receivedAt,
  createdByName: 'Admin',
  lineCount: 1,
  totalQuantity: '10',
  version: 1,
  updatedAt: receivedAt,
});

it('groups receipts by day and opens one day on tap', async () => {
  list.mockResolvedValue({
    items: [
      receipt('1', '2026-12-12T03:00:00Z'),
      receipt('2', '2026-12-12T05:00:00Z'),
      receipt('3', '2026-12-10T05:00:00Z'),
    ],
    nextCursor: null,
  });
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={['/?month=2026-12']}>
        <PurchaseListPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  await waitFor(() =>
    expect(list).toHaveBeenLastCalledWith(undefined, undefined, {
      from: '2026-12-01',
      to: '2026-12-31',
    }),
  );
  expect(await screen.findByText('2 phiếu · SL 20')).toBeInTheDocument();
  await userEvent.click(
    screen.getByRole('button', { name: /Ngày 12\/12\/2026/ }),
  );
  await waitFor(() =>
    expect(list).toHaveBeenLastCalledWith(undefined, undefined, {
      from: '2026-12-12',
      to: '2026-12-12',
    }),
  );
  expect(
    screen.getByRole('button', { name: 'Bỏ lọc ngày 12/12/2026' }),
  ).toBeInTheDocument();
});
