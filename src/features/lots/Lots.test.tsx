import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '@/shared/ui/feedback/ToastProvider';
import { InventoryFeaturesCard } from './components/InventoryFeaturesCard';
import { ProductTrackingCard } from './components/ProductTrackingCard';
import { PurchaseLotsSection } from './components/PurchaseLotsSection';
import { ExpiryPage } from './pages/ExpiryPage';
import { sumQuantities, toLotRows } from './model/lot-ui';

const userId = '10000000-0000-4000-8000-000000000001';
const key = '50000000-0000-4000-8000-000000000001';
const productId = '30000001-0000-4000-8000-000000000001';
const receiptId = '40000000-0000-4000-8000-000000000001';
const state = vi.hoisted(() => ({
  permissions: [] as string[],
  run: vi.fn(),
  api: {
    features: vi.fn(),
    setFeatures: vi.fn(),
    setTracking: vi.fn(),
    receiptLots: vi.fn(),
    setReceiptLots: vi.fn(),
    assign: vi.fn(),
    list: vi.fn(),
    parseAssign: vi.fn(),
  },
}));
vi.mock('@/features/auth', async (original) => ({
  ...(await original<typeof import('@/features/auth')>()),
  useSession: () => ({ session: { userId, permissions: state.permissions } }),
  usePrivateQueryKey:
    () =>
    (...parts: unknown[]) =>
      parts,
}));
vi.mock('@/shared/hooks/use-online-status', () => ({
  useOnlineStatus: () => true,
}));
vi.mock('@/shared/hooks/use-financial-command', () => ({
  useFinancialCommand: () => state.run,
}));
vi.mock('./api/lots-api', async (original) => ({
  ...(await original<typeof import('./api/lots-api')>()),
  createLotsApi: () => state.api,
}));

const lotList = (overrides = {}) => ({
  warningDays: 90,
  trackingMode: 'LOT',
  unassignedQty: '100',
  summary: { expired: 1, expiring: 1, ok: 1 },
  items: [
    {
      lotId: '60000000-0000-4000-8000-000000000001',
      productId,
      productName: '12B vàng',
      unitName: 'Hộp',
      trackingMode: 'LOT',
      lotNumber: 'A2510',
      expiryDate: '2026-10-31',
      daysLeft: -10,
      quantity: '2',
      status: 'EXPIRED',
    },
    {
      lotId: '60000000-0000-4000-8000-000000000002',
      productId,
      productName: '12B vàng',
      unitName: 'Hộp',
      trackingMode: 'LOT',
      lotNumber: 'A2611',
      expiryDate: '2027-09-30',
      daysLeft: 324,
      quantity: '10',
      status: 'OK',
    },
  ],
  unassigned: [
    {
      productId,
      productName: '12B vàng',
      unitName: 'Hộp',
      trackingMode: 'LOT',
      quantity: '100',
    },
  ],
  ...overrides,
});

function wrap(node: React.ReactNode, path = '/') {
  return render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <ToastProvider>
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route path="*" element={node} />
          </Routes>
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  state.permissions = [
    'settings.manage',
    'catalog.basic.manage',
    'inventory.read',
    'inventory.adjustment.post',
    'inventory.writeoff.post',
  ];
  state.run.mockImplementation(async ({ invoke }) => invoke(key));
  state.api.features.mockResolvedValue({
    lotTrackingEnabled: true,
    expiryWarningDays: 90,
    version: 2,
    trackedProductCount: 1,
  });
  state.api.list.mockResolvedValue(lotList());
});

describe('lot rows', () => {
  it('requires expiry and quantity, and a lot number only in LOT mode', () => {
    const row = { lotNumber: '', expiryDate: '2027-09-30', quantity: '10' };
    expect(toLotRows([row], 'LOT')).toBeNull();
    expect(toLotRows([row], 'EXPIRY')).toEqual([
      { lotNumber: null, expiryDate: '2027-09-30', quantity: '10' },
    ]);
    expect(toLotRows([{ ...row, quantity: '0' }], 'EXPIRY')).toBeNull();
    expect(sumQuantities([row, { ...row, quantity: '5' }])).toBe(15n);
  });
});

describe('InventoryFeaturesCard', () => {
  it('turns lot tracking off and on with the warning days', async () => {
    const user = userEvent.setup();
    state.api.features.mockResolvedValue({
      lotTrackingEnabled: false,
      expiryWarningDays: 90,
      version: 1,
      trackedProductCount: 0,
    });
    state.api.setFeatures.mockResolvedValue({
      lotTrackingEnabled: true,
      expiryWarningDays: 60,
      version: 2,
      trackedProductCount: 0,
    });
    wrap(<InventoryFeaturesCard />);
    const toggle = await screen.findByRole('switch');
    expect(toggle).not.toBeChecked();
    await user.click(toggle);
    const days = screen.getByDisplayValue('90');
    await user.clear(days);
    await user.type(days, '60');
    await user.click(
      screen.getByRole('button', { name: 'Lưu cấu hình hàng hóa' }),
    );
    await waitFor(() =>
      expect(state.api.setFeatures).toHaveBeenCalledWith({
        expectedVersion: 1,
        lotTrackingEnabled: true,
        expiryWarningDays: 60,
      }),
    );
  });
});

describe('ProductTrackingCard', () => {
  it('shows lots in stock and assigns older stock to a lot', async () => {
    const user = userEvent.setup();
    state.api.assign.mockResolvedValue({
      productId,
      assignedQty: '100',
      unassignedQty: '0',
    });
    wrap(<ProductTrackingCard productId={productId} unitName="Hộp" />);
    expect(await screen.findByText('Hết hạn 10 ngày')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Theo lô' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    const form = screen.getByRole('form', { name: 'Gán lô đầu kỳ' });
    await user.type(within(form).getByLabelText('Số lô'), 'A2601');
    await user.type(within(form).getByLabelText('Hạn dùng'), '2027-01-31');
    const quantity = within(form).getByLabelText('Số lượng');
    await user.type(quantity, '101');
    expect(within(form).getByText('Vượt số chưa có lô.')).toBeVisible();
    await user.clear(quantity);
    await user.type(quantity, '100');
    await user.click(within(form).getByRole('button', { name: 'Gán lô' }));
    await waitFor(() =>
      expect(state.api.assign).toHaveBeenCalledWith({
        productId,
        lots: [
          { lotNumber: 'A2601', expiryDate: '2027-01-31', quantity: '100' },
        ],
        idempotencyKey: key,
      }),
    );
  });

  it('switches the tracking mode', async () => {
    const user = userEvent.setup();
    state.api.setTracking.mockResolvedValue({
      productId,
      trackingMode: 'EXPIRY',
      unassignedQty: '100',
    });
    wrap(<ProductTrackingCard productId={productId} unitName="Hộp" />);
    await user.click(await screen.findByRole('button', { name: 'Chỉ HSD' }));
    await waitFor(() =>
      expect(state.api.setTracking).toHaveBeenCalledWith(productId, 'EXPIRY'),
    );
  });

  it('stays hidden while the store switch is off and the product is not tracked', async () => {
    state.api.features.mockResolvedValue({
      lotTrackingEnabled: false,
      expiryWarningDays: 90,
      version: 1,
      trackedProductCount: 0,
    });
    state.api.list.mockResolvedValue(
      lotList({
        trackingMode: 'NONE',
        items: [],
        unassigned: [],
        unassignedQty: '0',
      }),
    );
    wrap(<ProductTrackingCard productId={productId} unitName="Hộp" />);
    await waitFor(() => expect(state.api.list).toHaveBeenCalled());
    expect(
      screen.queryByRole('region', { name: 'Theo dõi hạn dùng' }),
    ).not.toBeInTheDocument();
  });
});

describe('PurchaseLotsSection', () => {
  it('saves lots for a tracked line and shows how much is still missing', async () => {
    const user = userEvent.setup();
    state.api.receiptLots.mockResolvedValue({
      items: [
        {
          productId,
          productName: '12B vàng',
          unitName: 'Hộp',
          receivedQty: '10',
          trackingMode: 'LOT',
          lots: [],
        },
      ],
    });
    state.api.setReceiptLots.mockResolvedValue({ items: [] });
    wrap(<PurchaseLotsSection receiptId={receiptId} version={1} editable />);
    await user.type(await screen.findByLabelText('Số lô'), 'A2611');
    await user.type(screen.getByLabelText('Hạn dùng'), '2027-09-30');
    await user.type(screen.getByLabelText('Số lượng'), '6');
    expect(screen.getByText('6/10 Hộp')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Lưu lô' }));
    await waitFor(() =>
      expect(state.api.setReceiptLots).toHaveBeenCalledWith(receiptId, [
        {
          productId,
          lots: [
            { lotNumber: 'A2611', expiryDate: '2027-09-30', quantity: '6' },
          ],
        },
      ]),
    );
  });
});

describe('ExpiryPage', () => {
  it('counts lots by status, filters by a status and links products', async () => {
    const user = userEvent.setup();
    wrap(<ExpiryPage />, '/more/expiry');
    expect(await screen.findByText('Hết hạn 10 ngày')).toBeVisible();
    expect(
      screen.getAllByRole('link', { name: '12B vàng' })[0],
    ).toHaveAttribute('href', `/products/${productId}`);
    await user.click(screen.getByRole('button', { name: /Đã hết hạn/ }));
    await waitFor(() =>
      expect(state.api.list).toHaveBeenLastCalledWith('EXPIRED'),
    );
  });
});
