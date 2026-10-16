import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Link, MemoryRouter } from 'react-router';
import { expect, it, vi } from 'vitest';
import { PurchaseListPage } from '../../inventory/purchase/pages/PurchaseListPage';
import { StockCountListPage } from '../../inventory/stock-count/pages/StockCountListPage';
import { ReturnListPage } from '../../returns/pages/ReturnListPage';
const list = vi.hoisted(() => vi.fn());
vi.mock('@/features/auth', () => ({
  usePrivateQueryKey:
    () =>
    (...parts: unknown[]) =>
      parts,
  useSession: () => ({ session: { permissions: [] } }),
}));
vi.mock('../../inventory/purchase/api/purchase-api', () => ({
  createPurchaseApi: () => ({ list }),
}));
vi.mock('../../inventory/stock-count/api/stock-count-api', () => ({
  createStockCountApi: () => ({ list }),
}));
vi.mock('../../returns/api/returns-api', () => ({
  createReturnsApi: () => ({ list }),
}));
it.each([
  [PurchaseListPage, 'AWAITING_COST', 'purchase'],
  [StockCountListPage, 'COUNTED', 'stock'],
  [ReturnListPage, 'REQUESTED', 'return'],
] as const)(
  'opens %s with the dashboard status and reacts to URL navigation',
  async (Component, status, kind) => {
    list.mockReset().mockResolvedValue({ items: [], nextCursor: null });
    render(
      <QueryClientProvider
        client={
          new QueryClient({ defaultOptions: { queries: { retry: false } } })
        }
      >
        <MemoryRouter initialEntries={[`/?status=${status}`]}>
          <Link to="?">Tất cả phiếu</Link>
          <Component />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    await waitFor(() => expect(list).toHaveBeenCalled());
    expect(screen.getByRole('combobox')).toHaveValue(status);
    expect(list).toHaveBeenLastCalledWith(
      kind === 'return' ? { search: '', status } : status,
      undefined,
    );
    await userEvent.click(screen.getByRole('link', { name: 'Tất cả phiếu' }));
    await waitFor(() =>
      expect(list).toHaveBeenLastCalledWith(
        kind === 'return' ? { search: '', status: '' } : undefined,
        undefined,
      ),
    );
    expect(screen.getByRole('combobox')).toHaveValue('');
  },
);
