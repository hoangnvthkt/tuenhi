import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { ToastContext } from '@/shared/ui/feedback/toast-context';
import type { LegacySalesApi } from '../../legacy-sales/legacy-sales-api';
import { LegacyImportFlow } from './LegacyImportFlow';
import type { LegacyParseResult } from './legacy-q237-parser';

const importRunId = '10000000-0000-4000-8000-000000000001';

function parsedResult(): LegacyParseResult {
  return {
    fileName: 'du-lieu-cu-tong-hop.xlsx',
    fileSha256: 'a'.repeat(64),
    sales: [
      {
        sourceSaleNumber: 'HD-GIA-001',
        sourceRowStart: 2,
        soldOn: '2026-08-21',
        staffLabel: '',
        channelLabel: '',
        customerLabel: '',
        customerPhone: '',
        paymentLabel: '',
        proposedPaymentMethod: null,
        statusLabel: 'Hoàn thành',
        note: '',
        warningCodes: [],
        lines: [
          {
            sourceRowNumber: 2,
            lineNumber: 1,
            productCode: '',
            productName: 'Sản phẩm Mẫu',
            quantity: '1',
            unitPrice: '25000',
            unitPriceProvenance: 'SOURCE_VALUE',
            lineDiscount: '0',
            lineTotal: '25000',
            lineTotalProvenance: 'SOURCE_VALUE',
            warningCodes: [],
          },
        ],
      },
    ],
    productCandidates: [],
    customerCandidates: [],
    openingSuggestions: [],
    labels: { staff: [], channel: [], customer: [], product: [] },
    issues: [],
  };
}

function apiMock(): LegacySalesApi {
  return {
    list: vi.fn(),
    detail: vi.fn(),
    createImport: vi.fn().mockResolvedValue({
      importRunId,
      status: 'UPLOADED',
      expiresAt: '2026-09-21T00:00:00Z',
    }),
    saveMapping: vi.fn().mockResolvedValue({
      importRunId,
      status: 'MAPPED',
    }),
    uploadChunk: vi
      .fn()
      .mockRejectedValueOnce(new Error('network detail'))
      .mockResolvedValueOnce({
        importRunId,
        status: 'VALIDATED',
        totalRows: 1,
        validRows: 1,
        invalidRows: 0,
        nextChunkIndex: 1,
      }),
    validateImport: vi.fn().mockResolvedValue({
      importRunId,
      status: 'VALIDATED',
      totalRows: 1,
      validRows: 1,
      invalidRows: 0,
      warningCount: 0,
      isOperational: false,
    }),
    commitImport: vi.fn().mockResolvedValue({
      importRunId,
      adapterId: 'LEGACY_Q237_V1',
      archiveSales: 1,
      archiveLines: 1,
      openingSuggestions: 0,
      isOperational: false,
    }),
  };
}

describe('LegacyImportFlow', () => {
  it('retries the same chunk without resaving mapping and completes read-only archive', async () => {
    const api = apiMock();
    const parse = vi.fn().mockResolvedValue(parsedResult());
    render(
      <MemoryRouter>
        <ToastContext.Provider value={{ show: vi.fn(), dismiss: vi.fn() }}>
          <LegacyImportFlow
            isOnline
            api={api}
            parse={parse}
            loadTargets={async () => ({
              staff: [],
              channel: [],
              customer: [],
              product: [],
            })}
            onBack={vi.fn()}
          />
        </ToastContext.Provider>
      </MemoryRouter>,
    );

    await userEvent.upload(
      screen.getByLabelText('Chọn workbook dữ liệu cũ'),
      new File(['xlsx'], 'du-lieu-cu-tong-hop.xlsx'),
    );
    await userEvent.click(
      await screen.findByRole('button', { name: 'Kiểm tra dữ liệu cũ' }),
    );
    await screen.findByRole('button', { name: 'Thử kiểm tra lại' });
    await userEvent.click(
      screen.getByRole('button', { name: 'Thử kiểm tra lại' }),
    );

    await screen.findByRole('heading', { name: 'Xác nhận kho tra cứu riêng' });
    expect(api.saveMapping).toHaveBeenCalledTimes(1);
    expect(api.uploadChunk).toHaveBeenCalledTimes(2);
    expect(vi.mocked(api.uploadChunk).mock.calls[1]?.[0]).toEqual(
      vi.mocked(api.uploadChunk).mock.calls[0]?.[0],
    );

    await userEvent.click(
      screen.getByRole('button', { name: 'Lưu vào dữ liệu cũ' }),
    );
    expect(await screen.findByText('Đã lưu 1 hóa đơn cũ.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Mở dữ liệu cũ' })).toHaveAttribute(
      'href',
      `/legacy-sales?importRunId=${importRunId}`,
    );
    await waitFor(() => expect(api.commitImport).toHaveBeenCalledTimes(1));
  });
});
