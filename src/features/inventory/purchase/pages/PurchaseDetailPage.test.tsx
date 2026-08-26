import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '@/shared/ui/feedback/ToastProvider';
import { SessionContextValue } from '@/features/auth';
import { PurchaseDetailPage } from './PurchaseDetailPage';
import type { createPurchaseApi } from '../api/purchase-api';
import type { PurchaseReceipt } from '../api/purchase-schemas';
import type { createCatalogApi } from '@/features/catalog';
import type { createDirectoryApi } from '@/features/directories';

const receipt: PurchaseReceipt = {
  id: '10000000-0000-4000-8000-000000000001',
  receiptNumber: null,
  status: 'DRAFT',
  supplierId: null,
  supplierName: null,
  receivedAt: '2026-08-22T08:00:00+00:00',
  note: null,
  createdBy: '10000000-0000-4000-8000-000000000002',
  createdByName: 'Nhân viên kho',
  submittedByName: null,
  postedByName: null,
  reversedByName: null,
  cancelledByName: null,
  submittedAt: null,
  postedAt: null,
  reversedAt: null,
  cancelledAt: null,
  reverseReason: null,
  cancelReason: null,
  version: 1,
  createdAt: '2026-08-22T08:00:00+00:00',
  updatedAt: '2026-08-22T08:00:00+00:00',
  lines: [
    {
      id: '10000000-0000-4000-8000-000000000003',
      productId: '10000000-0000-4000-8000-000000000004',
      productName: 'Thuốc A',
      sku: 'THUOC-A',
      unitName: 'Hộp',
      receivedQty: '2',
      lineOrder: 0,
    },
  ],
};

function renderPage(permissions: string[], online = true) {
  const getPurchaseCost = vi.fn();
  const inventoryApi = {
    detail: vi.fn().mockResolvedValue(receipt),
    cost: getPurchaseCost,
  } as unknown as ReturnType<typeof createPurchaseApi>;
  const catalogApi = {
    list: vi.fn().mockResolvedValue({
      items: [
        {
          id: receipt.lines[0]!.productId,
          sku: 'THUOC-A',
          name: 'Thuốc A',
          unitName: 'Hộp',
          isActive: true,
        },
      ],
      nextCursor: null,
    }),
  } as unknown as ReturnType<typeof createCatalogApi>;
  const directoryApi = {
    listSuppliers: vi.fn().mockResolvedValue({ items: [], nextCursor: null }),
  } as unknown as ReturnType<typeof createDirectoryApi>;
  render(
    <SessionContextValue.Provider
      value={{
        status: 'authenticated',
        session: {
          userId: '10000000-0000-4000-8000-000000000002',
          email: 'staff@example.invalid',
          displayName: 'Nhân viên kho',
          roleTemplate: 'SALES_WAREHOUSE',
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
      <ToastProvider>
        <MemoryRouter initialEntries={[`/more/purchases/${receipt.id}`]}>
          <Routes>
            <Route
              path="/more/purchases/:receiptId"
              element={
                <PurchaseDetailPage
                  api={inventoryApi}
                  catalogApi={catalogApi}
                  directoryApi={directoryApi}
                  online={online}
                />
              }
            />
          </Routes>
        </MemoryRouter>
      </ToastProvider>
    </SessionContextValue.Provider>,
  );
  return { getPurchaseCost };
}

describe('PurchaseDetailPage cost boundary', () => {
  it('does not fetch, render or cache cost DTO for operational staff', async () => {
    const { getPurchaseCost } = renderPage([
      'purchase.operational.read',
      'purchase.draft.manage',
    ]);
    expect(
      await screen.findByText('Thuốc A', { exact: false }),
    ).toBeInTheDocument();
    expect(getPurchaseCost).not.toHaveBeenCalled();
    expect(screen.queryByText(/Tổng giá nhập/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Đơn giá/)).not.toBeInTheDocument();
  });

  it('locks commands offline and explains that it will not retry', async () => {
    renderPage(['purchase.draft.manage'], false);
    expect(await screen.findByRole('status')).toHaveTextContent(
      /không tự gửi lại/,
    );
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Lưu nháp' })).toBeDisabled(),
    );
  });
});
