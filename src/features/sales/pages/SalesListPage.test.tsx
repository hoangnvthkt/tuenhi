import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider, useLocation } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SalesListPage } from './SalesListPage';

const saleId = '10000000-0000-4000-8000-000000000001';
const list = vi.fn();

vi.mock('../api/sales-api', () => ({
  createSalesApi: () => ({ list }),
}));

const items = [
  {
    id: saleId,
    saleNumber: 'HD000001',
    status: 'COMPLETED',
    customerName: 'Khách thử',
    channelName: 'Tại quầy',
    netTotal: '150000',
    createdByName: 'Chủ cửa hàng',
    completedAt: '2026-08-31T07:00:00.000Z',
    sortAt: '2026-08-31T07:00:00.000Z',
    version: 2,
  },
];

function LocationProbe() {
  const location = useLocation();
  return (
    <output aria-label="URL hiện tại">
      {location.pathname + location.search}
    </output>
  );
}

function renderPage(initialEntry = '/sales') {
  const router = createMemoryRouter(
    [
      {
        path: '/sales',
        element: (
          <>
            <SalesListPage />
            <LocationProbe />
          </>
        ),
      },
      { path: '/sales/:saleId', element: <p>Chi tiết hóa đơn</p> },
      { path: '/pos/:saleId', element: <p>Chi tiết bản nháp</p> },
    ],
    { initialEntries: [initialEntry] },
  );
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return router;
}

beforeEach(() => {
  list.mockReset();
  list.mockResolvedValue({ items, nextCursor: null });
});

describe('SalesListPage', () => {
  it('restores search and status filters from the URL', async () => {
    renderPage('/sales?q=HD000001&status=COMPLETED');

    expect(await screen.findByLabelText('Tìm hóa đơn')).toHaveValue('HD000001');
    expect(screen.getByLabelText('Trạng thái hóa đơn')).toHaveValue(
      'COMPLETED',
    );
    await waitFor(() =>
      expect(list).toHaveBeenCalledWith({
        search: 'HD000001',
        status: 'COMPLETED',
      }),
    );
  });

  it('updates the URL immediately but debounces the search request', async () => {
    renderPage();
    await screen.findByText('HD000001');
    list.mockClear();

    fireEvent.change(screen.getByLabelText('Tìm hóa đơn'), {
      target: { value: 'HD000002' },
    });

    expect(screen.getByLabelText('URL hiện tại')).toHaveTextContent(
      '/sales?q=HD000002',
    );
    expect(list).not.toHaveBeenCalled();
    await waitFor(
      () =>
        expect(list).toHaveBeenCalledWith({
          search: 'HD000002',
          status: '',
        }),
      { timeout: 700 },
    );
  });

  it('opens a unique exact invoice number with Enter', async () => {
    const user = userEvent.setup();
    renderPage('/sales?q=HD000001');
    await screen.findByText('HD000001');

    await user.click(screen.getByLabelText('Tìm hóa đơn'));
    await user.keyboard('{Enter}');

    expect(await screen.findByText('Chi tiết hóa đơn')).toBeInTheDocument();
  });

  it('shows a safe refresh failure without discarding the current filter URL', async () => {
    list.mockRejectedValue(new Error('raw database failure'));
    renderPage('/sales?q=HD000099');

    expect(
      await screen.findByText('Không thể tải danh sách hóa đơn.'),
    ).toBeInTheDocument();
    expect(screen.queryByText('raw database failure')).not.toBeInTheDocument();
    expect(screen.getByLabelText('URL hiện tại')).toHaveTextContent(
      '/sales?q=HD000099',
    );
  });
});
