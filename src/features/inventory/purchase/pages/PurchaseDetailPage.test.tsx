import {
  act,
  fireEvent,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '@/shared/ui/feedback/ToastProvider';
import { renderWithQueryClient } from '@/shared/testing/render-with-query-client';
import { SessionContextValue } from '@/features/auth';
import { PurchaseDetailPage } from './PurchaseDetailPage';
import type { createPurchaseApi } from '../api/purchase-api';
import type { PurchaseReceipt } from '../api/purchase-schemas';
import type { createCatalogApi } from '@/features/catalog';
import type { createDirectoryApi } from '@/features/directories';
import type { ConnectedExplorerApi } from '@/features/connected-explorer';

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

function renderPage(
  permissions: string[],
  online = true,
  overrides: {
    receipt?: PurchaseReceipt;
    api?: Partial<ReturnType<typeof createPurchaseApi>>;
    directoryApi?: Partial<ReturnType<typeof createDirectoryApi>>;
    explorerApi?: Partial<ConnectedExplorerApi>;
  } = {},
) {
  const getPurchaseCost = vi.fn().mockResolvedValue({
    receiptId: receipt.id,
    receiptNumber: null,
    status: 'DRAFT',
    totalCost: '25000',
    lines: [
      {
        lineId: receipt.lines[0]!.id,
        unitCost: '12500',
        lineCost: '25000',
      },
    ],
  });
  const inventoryApi = {
    detail: vi.fn().mockResolvedValue(overrides.receipt ?? receipt),
    cost: getPurchaseCost,
    save: vi.fn().mockResolvedValue({ receiptId: receipt.id, version: 2 }),
    post: vi.fn().mockResolvedValue({ receiptId: receipt.id, version: 3 }),
    command: vi.fn().mockResolvedValue({ receiptId: receipt.id, version: 2 }),
    ...overrides.api,
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
    ...overrides.directoryApi,
  } as unknown as ReturnType<typeof createDirectoryApi>;
  const explorerApi = {
    supplierDetail: vi.fn(),
    ...overrides.explorerApi,
  } as unknown as ConnectedExplorerApi;
  renderWithQueryClient(
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
              path="/more/purchases/new"
              element={
                <PurchaseDetailPage
                  mode="create"
                  api={inventoryApi}
                  catalogApi={catalogApi}
                  directoryApi={directoryApi}
                  explorerApi={explorerApi}
                  online={online}
                />
              }
            />
            <Route
              path="/more/purchases/:receiptId"
              element={
                <PurchaseDetailPage
                  api={inventoryApi}
                  catalogApi={catalogApi}
                  directoryApi={directoryApi}
                  explorerApi={explorerApi}
                  online={online}
                />
              }
            />
          </Routes>
        </MemoryRouter>
      </ToastProvider>
    </SessionContextValue.Provider>,
  );
  return { getPurchaseCost, inventoryApi };
}

vi.mock('@/shared/api/financial-outcome-api', () => ({
  createFinancialOutcomeApi: () => ({ lookup: vi.fn() }),
}));

const ownerPermissions = [
  'purchase.operational.read',
  'purchase.draft.manage',
  'purchase.cost.enter',
  'purchase.cost.read',
  'purchase.post',
  'catalog.read',
  'supplier.read',
  'supplier.manage',
];

const supplier = {
  id: '10000000-0000-4000-8000-000000000090',
  code: 'NCC-150',
  name: 'Nhà cung cấp thứ 150',
  phone: null,
  email: null,
  address: null,
  notes: null,
  isActive: true,
  version: 2,
};

describe('Purchase feedback fixes', () => {
  it('opens a posted receipt for its creator without requesting forbidden historical costs', async () => {
    const cost = vi.fn().mockRejectedValue(new Error('Forbidden'));
    renderPage(
      [
        'purchase.operational.read',
        'purchase.draft.manage',
        'purchase.cost.enter',
      ],
      true,
      {
        receipt: { ...receipt, status: 'POSTED', receiptNumber: 'PN000001' },
        api: { cost },
      },
    );
    expect(
      await screen.findByRole('heading', { name: 'PN000001' }),
    ).toBeInTheDocument();
    expect(cost).not.toHaveBeenCalled();
    expect(
      screen.queryByRole('button', { name: 'Tải lại phiếu nhập' }),
    ).not.toBeInTheDocument();
  });
  it('blocks posting changed fields until saved, then posts the refreshed version', async () => {
    const user = userEvent.setup();
    const fresh = {
      ...receipt,
      version: 2,
      note: 'Đã sửa',
      lines: [
        {
          ...receipt.lines[0]!,
          id: '10000000-0000-4000-8000-000000000099',
          receivedQty: '5',
        },
      ],
    };
    const detail = vi
      .fn()
      .mockResolvedValueOnce(receipt)
      .mockResolvedValue(fresh);
    const { inventoryApi } = renderPage(ownerPermissions, true, {
      api: { detail },
    });
    await screen.findByDisplayValue('12500');
    await user.type(screen.getByLabelText('Ghi chú'), 'Đã sửa');
    fireEvent.change(screen.getByLabelText('Số lượng nhận'), {
      target: { value: '5' },
    });
    expect(screen.getByRole('button', { name: 'Ghi sổ' })).toBeDisabled();
    expect(screen.getByText(/Lưu nháp.*trước khi ghi sổ/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Ghi sổ' }));
    expect(inventoryApi.post).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Lưu nháp' }));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Ghi sổ' })).toBeEnabled(),
    );
    expect(inventoryApi.save).toHaveBeenCalledWith(
      expect.objectContaining({
        note: 'Đã sửa',
        expectedVersion: 1,
        lines: [expect.objectContaining({ receivedQty: '5' })],
      }),
    );
    await user.click(screen.getByRole('button', { name: 'Ghi sổ' }));
    await waitFor(() =>
      expect(inventoryApi.post).toHaveBeenCalledWith(
        receipt.id,
        2,
        expect.any(String),
      ),
    );
  });

  it('hydrates every field and cost from the saved server version', async () => {
    const user = userEvent.setup();
    const detail = vi
      .fn()
      .mockResolvedValueOnce(receipt)
      .mockResolvedValue({
        ...receipt,
        note: 'Chuẩn hóa',
        version: 2,
        lines: [{ ...receipt.lines[0]!, receivedQty: '7' }],
      });
    const cost = vi
      .fn()
      .mockResolvedValueOnce({
        totalCost: '25000',
        lines: [{ lineId: receipt.lines[0]!.id, unitCost: '12500' }],
      })
      .mockResolvedValue({
        totalCost: '98000',
        lines: [{ lineId: receipt.lines[0]!.id, unitCost: '14000' }],
      });
    renderPage(ownerPermissions, true, { api: { detail, cost } });
    await screen.findByDisplayValue('12500');
    await user.click(screen.getByRole('button', { name: 'Lưu nháp' }));
    await waitFor(() =>
      expect(screen.getByLabelText('Ghi chú')).toHaveValue('Chuẩn hóa'),
    );
    expect(screen.getByLabelText('Số lượng nhận')).toHaveValue('7');
    expect(screen.getByLabelText('Đơn giá nhập')).toHaveValue('14000');
  });

  it('keeps editing locked until the matching slow cost snapshot arrives', async () => {
    let resolveCost!: (value: unknown) => void;
    const cost = vi.fn(
      () =>
        new Promise((resolve) => {
          resolveCost = resolve;
        }),
    ) as unknown as ReturnType<typeof createPurchaseApi>['cost'];
    renderPage(ownerPermissions, true, { api: { cost } });
    await waitFor(() => expect(cost).toHaveBeenCalled());
    expect(screen.getByLabelText('Ghi chú')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Lưu nháp' })).toBeDisabled();
    await act(async () =>
      resolveCost({
        totalCost: '25000',
        lines: [{ lineId: receipt.lines[0]!.id, unitCost: '12500' }],
      }),
    );
    expect(screen.getByLabelText('Đơn giá nhập')).toHaveValue('12500');
    expect(screen.getByLabelText('Ghi chú')).toBeEnabled();
  });

  it('displays a timestamp as local wall time and sends the same instant on save', async () => {
    const user = userEvent.setup();
    const instant = new Date(2026, 9, 2, 15, 16).toISOString();
    const { inventoryApi } = renderPage(ownerPermissions, true, {
      receipt: { ...receipt, receivedAt: instant },
    });
    await screen.findByDisplayValue('12500');
    expect(screen.getByLabelText('Ngày nhận')).toHaveValue('2026-10-02T15:16');
    await user.click(screen.getByRole('button', { name: 'Lưu nháp' }));
    await waitFor(() =>
      expect(inventoryApi.save).toHaveBeenCalledWith(
        expect.objectContaining({ receivedAt: instant }),
      ),
    );
  });

  it('hydrates a selected supplier absent from the first page and searches remotely', async () => {
    const user = userEvent.setup();
    const listSuppliers = vi.fn().mockImplementation(async ({ search }) => ({
      items: search === '150' ? [supplier] : [],
      nextCursor: null,
    }));
    renderPage(ownerPermissions, true, {
      receipt: {
        ...receipt,
        supplierId: supplier.id,
        supplierName: supplier.name,
      },
      directoryApi: { listSuppliers },
      explorerApi: { supplierDetail: vi.fn().mockResolvedValue(supplier) },
    });
    expect(
      await screen.findByRole('option', { name: supplier.name }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Nhà cung cấp')).toHaveValue(supplier.id);
    await user.type(screen.getByLabelText('Tìm nhà cung cấp'), '150');
    await waitFor(() =>
      expect(listSuppliers).toHaveBeenCalledWith(
        expect.objectContaining({ search: '150' }),
      ),
    );
    expect(screen.getByLabelText('Nhà cung cấp')).toHaveValue(supplier.id);
  });

  it('distinguishes failed supplier loading from empty results and retries', async () => {
    const user = userEvent.setup();
    const listSuppliers = vi
      .fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue({ items: [supplier], nextCursor: null });
    renderPage(ownerPermissions, true, { directoryApi: { listSuppliers } });
    expect(
      await screen.findByText(/Không thể tải nhà cung cấp/),
    ).toBeInTheDocument();
    await user.click(
      screen.getByRole('button', { name: 'Thử lại nhà cung cấp' }),
    );
    expect(
      await screen.findByRole('option', { name: supplier.name }),
    ).toBeInTheDocument();
  });

  it('loads another supplier page and keeps the chosen supplier while searching elsewhere', async () => {
    const user = userEvent.setup();
    const first = {
      ...supplier,
      id: '10000000-0000-4000-8000-000000000091',
      name: 'NCC trang đầu',
    };
    const cursor = { name: 'ncc trang đầu', id: first.id };
    const listSuppliers = vi
      .fn()
      .mockImplementation(async (input) =>
        input.search
          ? { items: [], nextCursor: null }
          : input.cursor
            ? { items: [supplier], nextCursor: null }
            : { items: [first], nextCursor: cursor },
      );
    renderPage(ownerPermissions, true, {
      directoryApi: { listSuppliers },
      explorerApi: { supplierDetail: vi.fn().mockResolvedValue(supplier) },
    });
    await user.click(
      await screen.findByRole('button', { name: 'Xem thêm nhà cung cấp' }),
    );
    await screen.findByRole('option', { name: supplier.name });
    expect(listSuppliers).toHaveBeenCalledWith(
      expect.objectContaining({ cursor }),
    );
    await user.selectOptions(
      screen.getByLabelText('Nhà cung cấp'),
      supplier.id,
    );
    await user.type(screen.getByLabelText('Tìm nhà cung cấp'), 'không khớp');
    await screen.findByText('Không có nhà cung cấp phù hợp.');
    expect(screen.getByLabelText('Nhà cung cấp')).toHaveValue(supplier.id);
    expect(
      await screen.findByRole('option', { name: supplier.name }),
    ).toBeInTheDocument();
  });

  it('keeps a failed exact supplier selection visible without exposing management to read-only staff', async () => {
    renderPage(
      ownerPermissions.filter((permission) => permission !== 'supplier.manage'),
      true,
      {
        receipt: {
          ...receipt,
          supplierId: supplier.id,
          supplierName: supplier.name,
        },
        explorerApi: {
          supplierDetail: vi.fn().mockRejectedValue(new Error('offline')),
        },
      },
    );
    await screen.findByText(/Không thể tải nhà cung cấp/);
    expect(screen.getByLabelText('Nhà cung cấp')).toHaveValue(supplier.id);
    expect(
      screen.getByRole('option', { name: supplier.name }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Thêm nhà cung cấp' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Sửa nhà cung cấp' }),
    ).not.toBeInTheDocument();
  });

  it('locks commands after a failed authoritative refresh until the receipt is reloaded', async () => {
    const user = userEvent.setup();
    const detail = vi
      .fn()
      .mockResolvedValueOnce(receipt)
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue({ ...receipt, version: 2, note: 'Bản đã lưu' });
    const { inventoryApi } = renderPage(ownerPermissions, true, {
      api: { detail },
    });
    await screen.findByDisplayValue('12500');
    await user.click(screen.getByRole('button', { name: 'Lưu nháp' }));
    const reloadButton = await screen.findByRole('button', {
      name: 'Tải lại phiếu nhập',
    });
    expect(screen.getByRole('button', { name: 'Ghi sổ' })).toBeDisabled();
    expect(screen.getByLabelText('Ghi chú')).toBeDisabled();
    expect(inventoryApi.post).not.toHaveBeenCalled();
    await user.click(reloadButton);
    await waitFor(() =>
      expect(screen.getByLabelText('Ghi chú')).toHaveValue('Bản đã lưu'),
    );
    expect(screen.getByRole('button', { name: 'Ghi sổ' })).toBeEnabled();
  });

  it('creates a supplier inline without saving or discarding edited receipt fields', async () => {
    const user = userEvent.setup();
    const saveSupplier = vi
      .fn()
      .mockResolvedValue({ supplierId: supplier.id, version: 1 });
    const { inventoryApi } = renderPage(ownerPermissions, true, {
      directoryApi: { saveSupplier },
    });
    await screen.findByDisplayValue('12500');
    await user.type(screen.getByLabelText('Ghi chú'), 'Giữ lại ghi chú');
    await user.click(screen.getByRole('button', { name: 'Thêm nhà cung cấp' }));
    const editor = screen.getByRole('region', {
      name: 'Thông tin nhà cung cấp',
    });
    await user.type(
      within(editor).getByLabelText('Tên nhà cung cấp'),
      'NCC mới',
    );
    await user.click(
      within(editor).getByRole('button', { name: 'Lưu nhà cung cấp' }),
    );
    await waitFor(() =>
      expect(screen.getByLabelText('Nhà cung cấp')).toHaveValue(supplier.id),
    );
    expect(screen.getByLabelText('Ghi chú')).toHaveValue('Giữ lại ghi chú');
    expect(inventoryApi.save).not.toHaveBeenCalled();
  });

  it('locks receipt actions during inline supplier editing and updates its selected version', async () => {
    const user = userEvent.setup();
    const saveSupplier = vi
      .fn()
      .mockResolvedValue({ supplierId: supplier.id, version: 3 });
    renderPage(ownerPermissions, true, {
      receipt: {
        ...receipt,
        supplierId: supplier.id,
        supplierName: supplier.name,
      },
      directoryApi: { saveSupplier },
      explorerApi: { supplierDetail: vi.fn().mockResolvedValue(supplier) },
    });
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Sửa nhà cung cấp' }),
      ).toBeEnabled(),
    );
    await user.click(screen.getByRole('button', { name: 'Sửa nhà cung cấp' }));
    expect(screen.getByRole('button', { name: 'Ghi sổ' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Lưu nháp' })).toBeDisabled();
    const editor = screen.getByRole('region', {
      name: 'Thông tin nhà cung cấp',
    });
    await user.clear(within(editor).getByLabelText('Tên nhà cung cấp'));
    await user.type(
      within(editor).getByLabelText('Tên nhà cung cấp'),
      'Tên đã sửa',
    );
    await user.click(
      within(editor).getByRole('button', { name: 'Lưu nhà cung cấp' }),
    );
    expect(
      await screen.findByRole('option', { name: 'Tên đã sửa' }),
    ).toBeInTheDocument();
    expect(saveSupplier).toHaveBeenCalledWith(
      expect.objectContaining({ supplierId: supplier.id, expectedVersion: 2 }),
    );
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Ghi sổ' })).toBeEnabled(),
    );
  });

  it('requires a reversal reason and explicit confirmation before the financial command', async () => {
    const user = userEvent.setup();
    const { inventoryApi } = renderPage(ownerPermissions, true, {
      receipt: { ...receipt, status: 'POSTED', receiptNumber: 'PN000001' },
    });
    await screen.findByText('Tổng giá nhập: 25.000 ₫');
    await user.click(screen.getByRole('button', { name: 'Đảo phiếu' }));
    expect(inventoryApi.command).not.toHaveBeenCalled();
    expect(
      screen.getByRole('button', { name: 'Xác nhận đảo phiếu' }),
    ).toBeDisabled();
    await user.type(
      screen.getByLabelText('Lý do đảo phiếu'),
      'Nhập nhầm số lượng',
    );
    await user.click(
      screen.getByRole('button', { name: 'Xác nhận đảo phiếu' }),
    );
    await waitFor(() =>
      expect(inventoryApi.command).toHaveBeenCalledWith(
        'reverse',
        receipt.id,
        1,
        'Nhập nhầm số lượng',
        expect.any(String),
      ),
    );
  });

  it('prefills a replacement only after an explicit action and never saves or posts it', async () => {
    const user = userEvent.setup();
    const { inventoryApi } = renderPage(ownerPermissions, true, {
      receipt: { ...receipt, status: 'REVERSED', receiptNumber: 'PN000001' },
    });
    await user.click(
      await screen.findByRole('button', { name: 'Lập phiếu thay thế' }),
    );
    expect(
      await screen.findByRole('heading', { name: 'Lập phiếu nhập' }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Số lượng nhận')).toHaveValue('2');
    expect(screen.getByLabelText('Đơn giá nhập')).toHaveValue('12500');
    expect(inventoryApi.save).not.toHaveBeenCalled();
    expect(inventoryApi.post).not.toHaveBeenCalled();
  });
});

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

  it('links a selected receipt line back to its product context', async () => {
    renderPage([
      'purchase.operational.read',
      'purchase.draft.manage',
      'catalog.read',
    ]);
    expect(
      await screen.findByRole('link', { name: 'Mở Thuốc A' }),
    ).toHaveAttribute('href', `/products/${receipt.lines[0]!.productId}`);
  });

  it('loads the creator draft cost for inline editing', async () => {
    const { getPurchaseCost } = renderPage([
      'purchase.operational.read',
      'purchase.draft.manage',
      'purchase.cost.enter',
    ]);

    await waitFor(() =>
      expect(screen.getByLabelText('Đơn giá nhập')).toHaveValue('12500'),
    );
    expect(getPurchaseCost).toHaveBeenCalledWith(receipt.id);
  });

  it('prefills exact product and supplier locally without saving a draft', async () => {
    const product = {
      id: '10000000-0000-4000-8000-000000000020',
      sku: 'SP-PREFILL',
      barcode: null,
      name: 'Sản phẩm prefill',
      categoryId: null,
      categoryName: null,
      unitName: 'Hộp',
      description: null,
      minStockQty: '0',
      isActive: true,
      version: 1,
      primaryImagePath: null,
      currentSalePrice: '20000',
      salePriceValidFrom: null,
      onHandQty: '0',
      images: [],
    };
    const supplier = {
      id: '10000000-0000-4000-8000-000000000021',
      code: 'NCC-PREFILL',
      name: 'NCC prefill',
      phone: null,
      email: null,
      address: null,
      notes: null,
      isActive: true,
      version: 1,
      canReadPurchases: true,
      canReadCost: false,
      distinctProductCount: 0,
      postedReceiptCount: 0,
      totalReceivedQty: '0',
      lastReceivedAt: null,
      totalPostedCost: null,
    };
    const save = vi.fn();
    const inventoryApi = {
      save,
    } as unknown as ReturnType<typeof createPurchaseApi>;
    const catalogApi = {
      list: vi.fn().mockResolvedValue({ items: [], nextCursor: null }),
      detail: vi.fn().mockResolvedValue(product),
    } as unknown as ReturnType<typeof createCatalogApi>;
    const directoryApi = {
      listSuppliers: vi.fn().mockResolvedValue({ items: [], nextCursor: null }),
    } as unknown as ReturnType<typeof createDirectoryApi>;
    const explorerApi = {
      supplierDetail: vi.fn().mockResolvedValue(supplier),
    } as unknown as ConnectedExplorerApi;

    renderWithQueryClient(
      <SessionContextValue.Provider
        value={{
          status: 'authenticated',
          session: {
            userId: receipt.createdBy,
            email: 'staff@example.invalid',
            displayName: 'Nhân viên kho',
            roleTemplate: 'SALES_WAREHOUSE',
            isActive: true,
            mustChangePassword: false,
            permissions: [
              'purchase.draft.manage',
              'catalog.read',
              'supplier.read',
            ],
          },
          errorMessage: null,
          refresh: vi.fn(),
          signIn: vi.fn(),
          changePassword: vi.fn(),
          signOut: vi.fn(),
        }}
      >
        <ToastProvider>
          <MemoryRouter
            initialEntries={[
              `/more/purchases/new?productId=${product.id}&supplierId=${supplier.id}`,
            ]}
          >
            <Routes>
              <Route
                path="/more/purchases/new"
                element={
                  <PurchaseDetailPage
                    mode="create"
                    api={inventoryApi}
                    catalogApi={catalogApi}
                    directoryApi={directoryApi}
                    explorerApi={explorerApi}
                    online
                  />
                }
              />
            </Routes>
          </MemoryRouter>
        </ToastProvider>
      </SessionContextValue.Provider>,
    );

    expect(
      await screen.findByRole('option', { name: 'NCC prefill' }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Nhà cung cấp')).toHaveValue(supplier.id);
    expect(
      await screen.findByText('SP-PREFILL — Sản phẩm prefill'),
    ).toBeInTheDocument();
    expect(save).not.toHaveBeenCalled();
  });
});
