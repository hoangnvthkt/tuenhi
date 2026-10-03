import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router';
import { renderWithQueryClient } from '@/shared/testing/render-with-query-client';
import { SalesListPage } from '@/features/sales/pages/SalesListPage';
import { ReturnListPage } from '@/features/returns/pages/ReturnListPage';
import { StockCountListPage } from '@/features/inventory/stock-count/pages/StockCountListPage';
import { PurchaseListPage } from '@/features/inventory/purchase/pages/PurchaseListPage';
import { OpeningListPage } from '@/features/inventory/opening/pages/OpeningListPage';
const mocks = vi.hoisted(() => ({
  sales: vi.fn(),
  returns: vi.fn(),
  stock: vi.fn(),
  purchase: vi.fn(),
  opening: vi.fn(),
}));
vi.mock('@/features/sales/api/sales-api', () => ({
  createSalesApi: () => ({ list: mocks.sales }),
}));
vi.mock('@/features/returns/api/returns-api', () => ({
  createReturnsApi: () => ({ list: mocks.returns }),
}));
vi.mock('@/features/inventory/stock-count/api/stock-count-api', () => ({
  createStockCountApi: () => ({ list: mocks.stock }),
}));
vi.mock('@/features/inventory/purchase/api/purchase-api', () => ({
  createPurchaseApi: () => ({ list: mocks.purchase }),
}));
vi.mock('@/features/inventory/opening/api/opening-api', () => ({
  createOpeningApi: () => ({ list: mocks.opening }),
}));
vi.mock('@/features/auth', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/features/auth')>()),
  useSession: () => ({ session: { userId: 'owner', permissions: [] } }),
}));
const item = (id: string) => ({
  id,
  saleNumber: `HD${id}`,
  returnNumber: `TH${id}`,
  countNumber: `KK${id}`,
  receiptNumber: `PN${id}`,
  status: 'DRAFT',
  netTotal: '10',
  refundTotal: '10',
  totalQuantity: '1',
  totalValue: '10',
  lineCount: 1,
  createdByName: 'Owner',
});
beforeEach(() => vi.resetAllMocks());
for (const [Component, api, label] of [
  [SalesListPage, mocks.sales, 'HD'],
  [ReturnListPage, mocks.returns, 'TH'],
  [StockCountListPage, mocks.stock, 'KK'],
  [PurchaseListPage, mocks.purchase, 'PN'],
  [OpeningListPage, mocks.opening, 'KK'],
] as const) {
  it(`${Component.name} loads the last page once, deduplicates rows and retries page errors`, async () => {
    const cursor = {
      updatedAt: '2026-10-01T00:00:00Z',
      sortAt: '2026-10-01T00:00:00Z',
      id: '1',
    };
    api
      .mockResolvedValueOnce({ items: [item('1')], nextCursor: cursor })
      .mockRejectedValueOnce(new Error('Network'))
      .mockResolvedValue({ items: [item('1'), item('2')], nextCursor: null });
    renderWithQueryClient(
      <MemoryRouter>
        <Component />
      </MemoryRouter>,
    );
    await screen.findByText(new RegExp(`${label}1`));
    fireEvent.click(screen.getByRole('button', { name: 'Tải thêm' }));
    await screen.findByRole('alert');
    fireEvent.click(screen.getByRole('button', { name: 'Thử lại' }));
    await screen.findByText(new RegExp(`${label}2`));
    expect(screen.getAllByText(new RegExp(`${label}1`))).toHaveLength(1);
    expect(
      screen.queryByRole('button', { name: 'Tải thêm' }),
    ).not.toBeInTheDocument();
    expect(api).toHaveBeenCalledTimes(3);
    expect(api.mock.calls[1]).toContainEqual(cursor);
  });
}
it('resets pages when a sales filter changes while the old next page is in flight', async () => {
  let finish!: (value: unknown) => void;
  mocks.sales.mockImplementation((filters, cursor) =>
    filters.status === 'COMPLETED'
      ? Promise.resolve({
          items: [{ ...item('3'), status: 'COMPLETED' }],
          nextCursor: null,
        })
      : cursor
        ? new Promise((resolve) => {
            finish = resolve;
          })
        : Promise.resolve({
            items: [item('1')],
            nextCursor: { sortAt: '2026-10-01T00:00:00Z', id: '1' },
          }),
  );
  renderWithQueryClient(
    <MemoryRouter>
      <SalesListPage />
    </MemoryRouter>,
  );
  fireEvent.click(await screen.findByRole('button', { name: 'Tải thêm' }));
  fireEvent.change(screen.getByLabelText('Trạng thái hóa đơn'), {
    target: { value: 'COMPLETED' },
  });
  await screen.findByText('HD3');
  finish({ items: [item('2')], nextCursor: null });
  await waitFor(() =>
    expect(screen.queryByText('HD1')).not.toBeInTheDocument(),
  );
  expect(screen.queryByText('HD2')).not.toBeInTheDocument();
});
