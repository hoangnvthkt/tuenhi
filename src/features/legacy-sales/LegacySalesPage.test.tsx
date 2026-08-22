import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import type { LegacySalesApi } from './legacy-sales-api';
import { LegacySalesPage } from './LegacySalesPage';

const saleId = '10000000-0000-4000-8000-000000000001';
const runId = '10000000-0000-4000-8000-000000000002';

function apiMock(): LegacySalesApi {
  return {
    list: vi.fn().mockResolvedValue({
      items: [
        {
          id: saleId,
          sourceSaleNumber: 'HD-GIA-001',
          soldOn: '2026-08-21',
          customerLabel: 'Khách Mẫu',
          channelLabel: 'Online',
          reportedNetTotal: '49000.00',
          qualityStatus: 'WARNING',
          warningCount: 2,
          isOperational: false,
          sourceImportRunId: runId,
        },
      ],
      nextCursor: null,
    }),
    detail: vi.fn(),
    createImport: vi.fn(),
    saveMapping: vi.fn(),
    uploadChunk: vi.fn(),
    validateImport: vi.fn(),
    commitImport: vi.fn(),
  };
}

function renderPage(api = apiMock()) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <LegacySalesPage api={api} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return api;
}

describe('LegacySalesPage', () => {
  it('shows a read-only archive banner and searchable source rows', async () => {
    const api = renderPage();
    expect(await screen.findByText('HD-GIA-001')).toBeInTheDocument();
    expect(screen.getByText('Chỉ để tra cứu')).toBeInTheDocument();
    expect(screen.getByText('2 cảnh báo')).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('Tìm dữ liệu cũ'), 'HD-GIA');
    await userEvent.click(screen.getByRole('button', { name: 'Tìm kiếm' }));
    expect(api.list).toHaveBeenLastCalledWith(
      expect.objectContaining({ search: 'HD-GIA', limit: 30 }),
    );
  });

  it('never renders operational sale actions', async () => {
    renderPage();
    await screen.findByText('HD-GIA-001');
    for (const action of [
      'Trả hàng',
      'Hủy hóa đơn',
      'Thanh toán',
      'Ghi tồn kho',
      'Xem lợi nhuận',
    ]) {
      expect(screen.queryByText(action)).not.toBeInTheDocument();
    }
  });
});
