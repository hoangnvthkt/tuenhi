import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import type { LegacySalesApi } from '../api/legacy-sales-api';
import { LegacySaleDetailPage } from './LegacySaleDetailPage';

const saleId = '10000000-0000-4000-8000-000000000001';
const runId = '10000000-0000-4000-8000-000000000002';

function apiMock(): LegacySalesApi {
  return {
    list: vi.fn(),
    detail: vi.fn().mockResolvedValue({
      id: saleId,
      sourceSaleNumber: 'HD-GIA-001',
      sourceRowStart: 2,
      soldOn: '2026-08-21',
      staffLabel: 'Nhân viên Mẫu',
      channelLabel: 'Online',
      customerLabel: 'Khách Mẫu',
      customerPhone: '+84912345678',
      paymentLabel: 'Chuyển khoản',
      paymentMethod: 'BANK_TRANSFER',
      sourceStatusLabel: 'Hoàn thành',
      sourceNote: 'Ghi chú tổng hợp',
      profileId: null,
      customerId: null,
      salesChannelId: null,
      reportedSubtotal: '50000.00',
      reportedDiscountTotal: '1000.00',
      reportedNetTotal: '49000.00',
      qualityStatus: 'WARNING',
      warningCodes: ['LEGACY_CACHED_VALUE_UNVERIFIED'],
      adapterId: 'LEGACY_Q237_V1',
      sourceFileSha256: 'a'.repeat(64),
      sourceImportRunId: runId,
      mappingVersion: 1,
      lines: [
        {
          id: '10000000-0000-4000-8000-000000000003',
          sourceRowNumber: 2,
          lineNumber: 1,
          productLabel: 'Sản phẩm Mẫu',
          productCode: 'SP-GIA-001',
          productId: null,
          quantity: '2.000',
          unitPrice: '25000.00',
          unitPriceProvenance: 'CACHED_UNVERIFIED',
          lineDiscount: '1000.00',
          lineTotal: '49000.00',
          lineTotalProvenance: 'CACHED_UNVERIFIED',
          warningCodes: ['LEGACY_CACHED_VALUE_UNVERIFIED'],
        },
      ],
      isOperational: false,
    }),
    createImport: vi.fn(),
    saveMapping: vi.fn(),
    uploadChunk: vi.fn(),
    validateImport: vi.fn(),
    commitImport: vi.fn(),
  };
}

describe('LegacySaleDetailPage', () => {
  it('shows provenance, source row and warning without operational actions', async () => {
    const api = apiMock();
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={[`/legacy-sales/${saleId}`]}>
          <Routes>
            <Route
              path="/legacy-sales/:legacySaleId"
              element={<LegacySaleDetailPage api={api} />}
            />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );
    expect(await screen.findByText('HD-GIA-001')).toBeInTheDocument();
    expect(screen.getByText('Chỉ để tra cứu')).toBeInTheDocument();
    expect(screen.getByText('Dòng nguồn 2')).toBeInTheDocument();
    expect(screen.getAllByText('Cache chưa xác minh').length).toBeGreaterThan(
      0,
    );
    expect(
      screen.getByText('LEGACY_CACHED_VALUE_UNVERIFIED'),
    ).toBeInTheDocument();
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
