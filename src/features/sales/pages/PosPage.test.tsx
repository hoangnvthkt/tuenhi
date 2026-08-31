import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PosPage } from './PosPage';
import { acquirePosEditorLease } from '../model/pos-storage';

const mocks = vi.hoisted(() => ({
  catalogList: vi.fn().mockResolvedValue({ items: [] }),
}));

const channels = [
  {
    id: '10000000-0000-4000-8000-000000000001',
    code: 'IN_STORE',
    name: 'Tại quầy',
    sortOrder: 10,
    isActive: true,
    version: 1,
  },
  {
    id: '10000000-0000-4000-8000-000000000002',
    code: 'ONLINE',
    name: 'Online',
    sortOrder: 20,
    isActive: true,
    version: 1,
  },
];

vi.mock('@/shared/hooks/use-online-status', () => ({
  useOnlineStatus: () => true,
}));

vi.mock('@/features/auth', () => ({
  useSession: () => ({
    session: {
      userId: '10000000-0000-4000-8000-000000000099',
      permissions: ['sale.discount.apply'],
    },
  }),
}));

vi.mock('@/features/catalog', () => ({
  createCatalogApi: () => ({ list: mocks.catalogList }),
}));

vi.mock('@/features/directories', () => ({
  createDirectoryApi: () => ({
    listCustomers: vi.fn().mockResolvedValue({ items: [] }),
  }),
}));

vi.mock('@/features/settings', () => ({
  createSettingsApi: () => ({
    listSalesChannels: vi.fn().mockResolvedValue(channels),
  }),
}));

vi.mock('../api/sales-api', () => ({
  createSalesApi: () => ({ detail: vi.fn() }),
}));

vi.mock('../hooks/use-pos-commands', () => ({
  usePosCommands: () => ({
    discard: vi.fn(),
    pay: vi.fn(),
    save: vi.fn(),
    saving: false,
  }),
}));

function renderPage() {
  return render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <MemoryRouter>
        <PosPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('PosPage', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    mocks.catalogList.mockResolvedValue({ items: [] });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('keeps the selected sales channel instead of restoring stale cart state', async () => {
    const user = userEvent.setup();
    localStorage.setItem(
      'tuenhi:pos:cart:10000000-0000-4000-8000-000000000099',
      JSON.stringify({
        items: [],
        channelId: channels[0]!.id,
        customerId: '',
        orderDiscount: '0',
        note: '',
      }),
    );
    renderPage();

    const select = await screen.findByLabelText('Kênh bán');
    await screen.findByRole('option', { name: 'Online' });
    await user.selectOptions(select, channels[1]!.id);

    await waitFor(async () => {
      await new Promise((resolve) => window.setTimeout(resolve, 20));
      expect(select).toHaveValue(channels[1]!.id);
    });
  });

  it('drops a persisted cart line with a fractional quantity instead of restoring it', async () => {
    localStorage.setItem(
      'tuenhi:pos:cart:10000000-0000-4000-8000-000000000099',
      JSON.stringify({
        items: [
          {
            productId: '10000000-0000-4000-8000-000000000001',
            productName: 'Cũ',
            sku: 'CU-001',
            unitName: 'Cái',
            quantity: '1.5',
            unitSalePrice: '150000',
            lineDiscountAmount: '0',
            lineOrder: 0,
            onHandQty: '10',
          },
        ],
        channelId: channels[0]!.id,
        customerId: '',
        orderDiscount: '0',
        note: '',
      }),
    );

    renderPage();

    expect(
      await screen.findByText(
        'Một số dòng trong giỏ cũ có số lượng lẻ nên đã được bỏ.',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText('Cũ')).not.toBeInTheDocument();
  });

  it('shows a safe warning for a malformed legacy cart payload', async () => {
    localStorage.setItem(
      'tuenhi:pos:cart:10000000-0000-4000-8000-000000000099',
      '{not-json',
    );

    renderPage();

    expect(
      await screen.findByText(
        'Không thể phục hồi giỏ cũ trên thiết bị. Dữ liệu lỗi đã được bỏ qua.',
      ),
    ).toBeInTheDocument();
  });

  it('keeps a second POS tab read-only until the user explicitly takes over', async () => {
    const user = userEvent.setup();
    const userId = '10000000-0000-4000-8000-000000000099';
    const tabA = '20000000-0000-4000-8000-000000000001';
    const tabB = '20000000-0000-4000-8000-000000000002';
    sessionStorage.setItem('tuenhi:pos:tab-id', tabB);
    acquirePosEditorLease({
      userId,
      identity: { kind: 'NEW' },
      tabId: tabA,
      now: new Date(),
    });

    renderPage();

    expect(
      await screen.findByText('Giỏ hàng đang được chỉnh sửa ở tab khác.'),
    ).toBeInTheDocument();
    expect(await screen.findByLabelText('Kênh bán')).toBeDisabled();

    await user.click(
      screen.getByRole('button', { name: 'Tiếp tục ở tab này' }),
    );

    await waitFor(() =>
      expect(
        screen.queryByText('Giỏ hàng đang được chỉnh sửa ở tab khác.'),
      ).not.toBeInTheDocument(),
    );
    expect(screen.getByLabelText('Kênh bán')).toBeEnabled();
  });

  it('debounces product lookup instead of querying on every keystroke', async () => {
    renderPage();
    await screen.findByRole('combobox', { name: 'Tìm sản phẩm' });
    await waitFor(() => expect(mocks.catalogList).toHaveBeenCalled());
    mocks.catalogList.mockClear();

    fireEvent.change(screen.getByRole('combobox', { name: 'Tìm sản phẩm' }), {
      target: { value: 'áo' },
    });

    expect(mocks.catalogList).not.toHaveBeenCalled();
    await waitFor(
      () =>
        expect(mocks.catalogList).toHaveBeenCalledWith({
          search: 'áo',
          limit: 30,
        }),
      { timeout: 700 },
    );
  });

  it('focuses product search with slash but leaves editable fields alone', async () => {
    const user = userEvent.setup();
    renderPage();
    const search = await screen.findByRole('combobox', {
      name: 'Tìm sản phẩm',
    });
    search.blur();

    fireEvent.keyDown(window, { key: '/' });
    expect(search).toHaveFocus();

    const note = screen.getByPlaceholderText('Ghi chú (nếu có)');
    await user.click(note);
    await user.keyboard('/');
    expect(note).toHaveValue('/');
    expect(search).not.toHaveFocus();
  });

  it('opens checkout with Ctrl+Enter when the editable cart has an item', async () => {
    localStorage.setItem(
      'tuenhi:pos:cart:10000000-0000-4000-8000-000000000099',
      JSON.stringify({
        items: [
          {
            productId: '10000000-0000-4000-8000-000000000001',
            productName: 'Áo thử',
            sku: 'AO-001',
            unitName: 'Cái',
            quantity: '1',
            unitSalePrice: '150000',
            lineDiscountAmount: '0',
            lineOrder: 0,
            onHandQty: '10',
          },
        ],
        channelId: channels[0]!.id,
        customerId: '',
        orderDiscount: '0',
        note: '',
      }),
    );
    renderPage();
    await screen.findByText('Áo thử');

    fireEvent.keyDown(window, { key: 'Enter', ctrlKey: true });

    expect(
      await screen.findByRole('dialog', { name: 'Xác nhận thanh toán' }),
    ).toBeInTheDocument();
  });
});
