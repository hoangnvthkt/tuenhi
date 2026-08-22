import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import type { ImportApi } from './import-api';
import { ImportHistoryPage } from './ImportHistoryPage';

const runId = '10000000-0000-4000-8000-000000000001';

function apiMock(): ImportApi {
  return {
    createRun: vi.fn(),
    saveMapping: vi.fn(),
    validateChunk: vi.fn(),
    getValidation: vi.fn(),
    commit: vi.fn(),
    getResult: vi.fn().mockResolvedValue({
      importRunId: runId,
      targetType: 'CUSTOMERS',
      templateVersion: 2,
      fileName: 'customers-v2.xlsx',
      fileSha256: 'a'.repeat(64),
      mode: 'CREATE_ONLY',
      status: 'COMMITTED',
      totalRows: 4,
      validRows: 4,
      invalidRows: 0,
      result: {
        importRunId: runId,
        targetType: 'CUSTOMERS',
        createdRows: 4,
        updatedRows: 0,
        totalRows: 4,
      },
      createdAt: '2026-08-22T08:00:00Z',
      validatedAt: '2026-08-22T08:01:00Z',
      committedAt: '2026-08-22T08:02:00Z',
      expiresAt: '2026-09-21T08:00:00Z',
    }),
    listHistory: vi.fn().mockResolvedValue({
      items: [
        {
          importRunId: runId,
          targetType: 'CUSTOMERS',
          fileName: 'customers-v2.xlsx',
          mode: 'CREATE_ONLY',
          status: 'COMMITTED',
          totalRows: 4,
          validRows: 4,
          invalidRows: 0,
          createdAt: '2026-08-22T08:00:00Z',
          committedAt: '2026-08-22T08:02:00Z',
        },
      ],
      nextCursor: null,
    }),
  };
}

describe('ImportHistoryPage', () => {
  it('loads history metadata without workbook contents', async () => {
    const api = apiMock();
    render(
      <MemoryRouter initialEntries={['/imports/history']}>
        <Routes>
          <Route
            path="/imports/history"
            element={<ImportHistoryPage api={api} />}
          />
        </Routes>
      </MemoryRouter>,
    );
    expect(await screen.findByText('customers-v2.xlsx')).toBeInTheDocument();
    expect(screen.getByText(/4 dòng/)).toBeInTheDocument();
    expect(api.listHistory).toHaveBeenCalledWith({ limit: 30 });
  });

  it('reloads a committed result directly by run ID', async () => {
    const api = apiMock();
    render(
      <MemoryRouter initialEntries={[`/imports/${runId}`]}>
        <Routes>
          <Route
            path="/imports/:importRunId"
            element={<ImportHistoryPage api={api} />}
          />
        </Routes>
      </MemoryRouter>,
    );
    expect(await screen.findByText('Kết quả phiên nhập')).toBeInTheDocument();
    expect(await screen.findByText('customers-v2.xlsx')).toBeInTheDocument();
    expect(screen.getByText('Đã nhập')).toBeInTheDocument();
    expect(api.getResult).toHaveBeenCalledWith(runId);
  });
});
