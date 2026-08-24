import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { ToastContext } from '@/shared/ui/feedback/toast-context';
import { SessionContextValue } from '@/features/auth';
import type { ImportApi } from './import-api';
import type { LegacySalesApi } from '../legacy-sales/legacy-sales-api';
import { ImportPage } from './ImportPage';
import type { InspectedWorkbook } from './workbook-parser';

const importRunId = '10000000-0000-4000-8000-000000000001';
function apiMock(overrides: Partial<ImportApi> = {}): ImportApi {
  return {
    createRun: vi.fn().mockResolvedValue({
      importRunId,
      status: 'UPLOADED',
      expiresAt: '2026-09-21T00:00:00Z',
    }),
    saveMapping: vi.fn().mockResolvedValue({ importRunId, status: 'MAPPED' }),
    validateChunk: vi
      .fn()
      .mockImplementation(async ({ chunkIndex, rows, isLastChunk }) => ({
        importRunId,
        status: isLastChunk ? 'VALIDATED' : 'MAPPED',
        totalRows: chunkIndex * 250 + rows.length,
        validRows: chunkIndex * 250 + rows.length,
        invalidRows: 0,
        nextChunkIndex: chunkIndex + 1,
      })),
    getValidation: vi.fn().mockResolvedValue({
      summary: {
        importRunId,
        targetType: 'CATEGORIES',
        status: 'VALIDATED',
        totalRows: 1,
        validRows: 1,
        invalidRows: 0,
      },
      items: [
        {
          rowNumber: 2,
          status: 'VALID',
          values: { name: 'Nhóm A', isActive: true },
          errors: [],
        },
      ],
      nextCursorRowNumber: null,
    }),
    commit: vi.fn().mockResolvedValue({
      importRunId,
      targetType: 'CATEGORIES',
      createdRows: 1,
      updatedRows: 0,
      totalRows: 1,
    }),
    getResult: vi.fn(),
    listHistory: vi.fn(),
    ...overrides,
  };
}

function workbook(
  rows: InspectedWorkbook['rows'] = [{ rowNumber: 2, cells: ['Nhóm A', 'Có'] }],
  headers = ['Tên nhóm hàng', 'Hoạt động'],
): InspectedWorkbook {
  return {
    target: 'CATEGORIES',
    version: 1,
    fileName: 'categories-v1.xlsx',
    fileSha256: 'a'.repeat(64),
    exactTemplate: headers[0] === 'Tên nhóm hàng' && headers[1] === 'Hoạt động',
    headers,
    rows,
  };
}

function renderPage({
  api = apiMock(),
  inspected = workbook(),
  online = true,
  role = 'OWNER',
  permissions = ['catalog.basic.manage'],
}: {
  api?: ImportApi;
  inspected?: InspectedWorkbook;
  online?: boolean;
  role?: 'OWNER' | 'BUSINESS';
  permissions?: string[];
} = {}) {
  const show = vi.fn();
  const inspect = vi.fn().mockResolvedValue(inspected);
  const legacyApi: LegacySalesApi = {
    list: vi.fn(),
    detail: vi.fn(),
    createImport: vi.fn(),
    saveMapping: vi.fn(),
    uploadChunk: vi.fn(),
    validateImport: vi.fn(),
    commitImport: vi.fn(),
  };
  render(
    <SessionContextValue.Provider
      value={{
        status: 'authenticated',
        session: {
          userId: importRunId,
          email: 'owner@example.invalid',
          displayName: 'Chủ cửa hàng',
          roleTemplate: role,
          isActive: true,
          mustChangePassword: false,
          permissions,
        },
        errorMessage: null,
        refresh: vi.fn(),
        signIn: vi.fn(),
        changePassword: vi.fn(),
        signOut: vi.fn(),
      }}
    >
      <ToastContext.Provider value={{ show, dismiss: vi.fn() }}>
        <MemoryRouter>
          <ImportPage
            api={api}
            legacyApi={legacyApi}
            inspect={inspect}
            online={online}
          />
        </MemoryRouter>
      </ToastContext.Provider>
    </SessionContextValue.Provider>,
  );
  return { api, inspect, show };
}

async function uploadWorkbook() {
  const file = new File(['xlsx'], 'categories-v1.xlsx', {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  await userEvent.upload(screen.getByLabelText(/Chọn tệp Excel/), file);
  await screen.findByRole('button', { name: 'Chọn tệp khác' });
}

describe('ImportPage', () => {
  it('offers the owner-only legacy workflow to an authorized user', async () => {
    renderPage({ permissions: ['legacy.sale.import'] });
    await userEvent.click(
      screen.getByRole('button', { name: 'Nhập dữ liệu bán hàng cũ' }),
    );
    expect(
      screen.getByRole('heading', { name: 'Nhập dữ liệu bán hàng cũ' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Chỉ để tra cứu')).toBeInTheDocument();
  });

  it('completes the exact-template workflow and commits atomically', async () => {
    const api = apiMock();
    renderPage({ api });
    await uploadWorkbook();
    await userEvent.click(
      screen.getByRole('button', { name: 'Kiểm tra dữ liệu' }),
    );
    await waitFor(() => expect(api.validateChunk).toHaveBeenCalledTimes(1));
    await userEvent.click(
      await screen.findByRole('button', { name: 'Xác nhận nhập' }),
    );
    await userEvent.click(
      screen.getByRole('button', { name: 'Nhập toàn bộ dữ liệu' }),
    );
    expect(
      await screen.findByText('Nhập dữ liệu thành công'),
    ).toBeInTheDocument();
    expect(api.commit).toHaveBeenCalledWith(importRunId, expect.any(String));
  });

  it('requires explicit confirmation before ignoring an unknown column', async () => {
    const inspected = workbook(
      [{ rowNumber: 2, cells: ['Nhóm A', 'ghi chú'] }],
      ['Tên nhóm hàng', 'Cột lạ'],
    );
    renderPage({ inspected });
    await uploadWorkbook();
    const mapping = screen.getByRole('combobox', { name: 'Ghép cột Cột lạ' });
    await userEvent.selectOptions(mapping, 'IGNORED');
    expect(
      screen.getByRole('button', { name: 'Kiểm tra dữ liệu' }),
    ).toBeDisabled();
    await userEvent.click(
      screen.getByRole('checkbox', { name: 'Tôi xác nhận bỏ qua' }),
    );
    expect(
      screen.getByRole('button', { name: 'Kiểm tra dữ liệu' }),
    ).toBeEnabled();
  });

  it('sends at most 250 rows sequentially', async () => {
    const rows = Array.from({ length: 251 }, (_, index) => ({
      rowNumber: index + 2,
      cells: [`Nhóm ${index}`, 'Có'],
    }));
    const api = apiMock({
      getValidation: vi.fn().mockResolvedValue({
        summary: {
          importRunId,
          targetType: 'CATEGORIES',
          status: 'VALIDATED',
          totalRows: 251,
          validRows: 251,
          invalidRows: 0,
        },
        items: [],
        nextCursorRowNumber: null,
      }),
    });
    renderPage({ api, inspected: workbook(rows) });
    await uploadWorkbook();
    await userEvent.click(
      screen.getByRole('button', { name: 'Kiểm tra dữ liệu' }),
    );
    await waitFor(() => expect(api.validateChunk).toHaveBeenCalledTimes(2));
    expect(vi.mocked(api.validateChunk).mock.calls[0]?.[0]).toMatchObject({
      chunkIndex: 0,
      isLastChunk: false,
      rows: expect.any(Array),
    });
    expect(vi.mocked(api.validateChunk).mock.calls[0]?.[0].rows).toHaveLength(
      250,
    );
    expect(vi.mocked(api.validateChunk).mock.calls[1]?.[0]).toMatchObject({
      chunkIndex: 1,
      isLastChunk: true,
    });
  });

  it('shows client cell errors before sending any row to the server', async () => {
    const api = apiMock();
    renderPage({
      api,
      inspected: workbook([{ rowNumber: 2, cells: ['', 'Có'] }]),
    });
    await uploadWorkbook();
    await userEvent.click(
      screen.getByRole('button', { name: 'Kiểm tra dữ liệu' }),
    );
    expect(
      await screen.findAllByText('Giá trị bắt buộc không được để trống.'),
    ).not.toHaveLength(0);
    expect(
      screen.getByRole('button', { name: 'Tải tệp các dòng lỗi' }),
    ).toBeInTheDocument();
    expect(api.saveMapping).not.toHaveBeenCalled();
    expect(api.validateChunk).not.toHaveBeenCalled();
  });

  it('removes the sale price mapping for a non-owner', async () => {
    const api = apiMock();
    const inspected: InspectedWorkbook = {
      target: 'PRODUCTS',
      version: 1,
      fileName: 'products-v1.xlsx',
      fileSha256: 'b'.repeat(64),
      exactTemplate: true,
      headers: ['SKU', 'Tên sản phẩm', 'Đơn vị tính', 'Giá bán hiện hành'],
      rows: [{ rowNumber: 2, cells: ['SP-1', 'Sản phẩm A', 'Hộp', '25000'] }],
    };
    renderPage({ api, inspected, role: 'BUSINESS' });
    await userEvent.selectOptions(
      screen.getByLabelText('Loại dữ liệu'),
      'PRODUCTS',
    );
    await uploadWorkbook();
    expect(
      screen.getByText(/Bạn không có quyền nhập giá bán/),
    ).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole('button', { name: 'Kiểm tra dữ liệu' }),
    );
    await waitFor(() =>
      expect(api.saveMapping).toHaveBeenCalledWith(
        importRunId,
        expect.objectContaining({ 'Giá bán hiện hành': 'IGNORED' }),
      ),
    );
    expect(
      vi.mocked(api.validateChunk).mock.calls[0]?.[0].rows[0]?.values,
    ).not.toHaveProperty('salePrice');
  });

  it('blocks offline submission and never auto-submits after reconnect', async () => {
    const api = apiMock();
    const view = renderPage({ api, online: false });
    expect(screen.getByLabelText(/Chọn tệp Excel/)).toBeDisabled();
    expect(api.createRun).not.toHaveBeenCalled();
    fireEvent(window, new Event('online'));
    await waitFor(() => expect(api.createRun).not.toHaveBeenCalled());
    expect(view.inspect).not.toHaveBeenCalled();
  });

  it('keeps the same create idempotency key for a transport retry', async () => {
    const api = apiMock();
    vi.mocked(api.createRun)
      .mockRejectedValueOnce(new Error('network'))
      .mockResolvedValueOnce({
        importRunId,
        status: 'UPLOADED',
        expiresAt: '2026-09-21T00:00:00Z',
      });
    renderPage({ api });
    const file = new File(['xlsx'], 'categories-v1.xlsx');
    await userEvent.upload(screen.getByLabelText(/Chọn tệp Excel/), file);
    await userEvent.click(
      await screen.findByRole('button', { name: 'Thử lại với cùng tệp' }),
    );
    await screen.findByRole('button', { name: 'Chọn tệp khác' });
    const firstKey = vi.mocked(api.createRun).mock.calls[0]?.[0].idempotencyKey;
    expect(vi.mocked(api.createRun).mock.calls[1]?.[0].idempotencyKey).toBe(
      firstKey,
    );
  });

  it('retries the same row chunk after an unknown transport outcome', async () => {
    const api = apiMock();
    vi.mocked(api.validateChunk)
      .mockRejectedValueOnce(new Error('network'))
      .mockResolvedValueOnce({
        importRunId,
        status: 'VALIDATED',
        totalRows: 1,
        validRows: 1,
        invalidRows: 0,
        nextChunkIndex: 1,
      });
    renderPage({ api });
    await uploadWorkbook();
    await userEvent.click(
      screen.getByRole('button', { name: 'Kiểm tra dữ liệu' }),
    );
    await userEvent.click(
      await screen.findByRole('button', { name: 'Thử kiểm tra lại' }),
    );
    await waitFor(() => expect(api.validateChunk).toHaveBeenCalledTimes(2));
    expect(vi.mocked(api.validateChunk).mock.calls[1]?.[0]).toEqual(
      vi.mocked(api.validateChunk).mock.calls[0]?.[0],
    );
  });

  it('keeps the same commit idempotency key when confirmation is retried', async () => {
    const api = apiMock();
    vi.mocked(api.commit)
      .mockRejectedValueOnce(new Error('network'))
      .mockResolvedValueOnce({
        importRunId,
        targetType: 'CATEGORIES',
        createdRows: 1,
        updatedRows: 0,
        totalRows: 1,
      });
    renderPage({ api });
    await uploadWorkbook();
    await userEvent.click(
      screen.getByRole('button', { name: 'Kiểm tra dữ liệu' }),
    );
    await userEvent.click(
      await screen.findByRole('button', { name: 'Xác nhận nhập' }),
    );
    const commitButton = screen.getByRole('button', {
      name: 'Nhập toàn bộ dữ liệu',
    });
    await userEvent.click(commitButton);
    await screen.findByRole('alert');
    await userEvent.click(commitButton);
    expect(
      await screen.findByText('Nhập dữ liệu thành công'),
    ).toBeInTheDocument();
    expect(vi.mocked(api.commit).mock.calls[1]?.[1]).toBe(
      vi.mocked(api.commit).mock.calls[0]?.[1],
    );
  });
});
