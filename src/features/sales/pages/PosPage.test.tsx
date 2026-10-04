import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PosPage } from './PosPage';
import { acquirePosEditorLease } from '../model/pos-storage';

const mocks = vi.hoisted(() => ({
  preparePrint: vi.fn(),
  checkoutPending: false,
  reconcilePayment: vi.fn(),
  catalogList: vi.fn().mockResolvedValue({ items: [] }),
  catalogDetail: vi.fn(),
  customerDetail: vi.fn(),
  listCustomers: vi.fn().mockResolvedValue({ items: [] }),
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

vi.mock('@/features/auth', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/features/auth')>()),
  useSession: () => ({
    session: {
      userId: '10000000-0000-4000-8000-000000000099',
      permissions: ['sale.discount.apply'],
    },
  }),
}));

vi.mock('@/features/catalog', () => ({
  createCatalogApi: () => ({
    list: mocks.catalogList,
    detail: mocks.catalogDetail,
  }),
}));

vi.mock('@/features/directories', () => ({
  createDirectoryApi: () => ({
    listCustomers: mocks.listCustomers,
  }),
}));

vi.mock('@/features/connected-explorer', () => ({
  createCustomerExplorerApi: () => ({
    customerDetail: mocks.customerDetail,
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
    preparePrint: mocks.preparePrint,
    checkoutPending: mocks.checkoutPending,
    reconcilePayment: mocks.reconcilePayment,
    pendingPayment: { total: '100000', method: 'BANK_TRANSFER' },
    provisionalDocument: null,
    closePrint: vi.fn(),
    discard: vi.fn(),
    pay: vi.fn(),
    save: vi.fn(),
    saving: false,
  }),
}));

function renderPage(entry = '/pos') {
  return render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <MemoryRouter initialEntries={[entry]}>
        <PosPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('PosPage', () => {
  beforeEach(() => {
    mocks.checkoutPending = false;
    localStorage.clear();
    sessionStorage.clear();
    mocks.catalogList.mockResolvedValue({ items: [] });
    mocks.catalogDetail.mockReset();
    mocks.customerDetail.mockReset();
    mocks.listCustomers.mockResolvedValue({ items: [] });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('allows provisional printing with an in-stock quantity of zero', async () => {
    localStorage.setItem(
      'tuenhi:pos:cart:10000000-0000-4000-8000-000000000099',
      JSON.stringify({
        items: [
          {
            productId: '10000000-0000-4000-8000-000000000001',
            productName: 'Sữa hộp',
            sku: 'SUA',
            unitName: 'Hộp',
            quantity: '2',
            unitSalePrice: '50000',
            lineDiscountAmount: '0',
            lineOrder: 0,
            onHandQty: '0',
          },
        ],
        channelId: channels[0]!.id,
        customerId: '',
        orderDiscount: '0',
        note: '',
      }),
    );
    renderPage();
    const print = await screen.findByRole('button', { name: 'In tạm tính' });
    expect(print).toBeEnabled();
    await userEvent.click(print);
    expect(mocks.preparePrint).toHaveBeenCalledOnce();
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

  it('focuses a deeplink product without adding it until the user confirms', async () => {
    const user = userEvent.setup();
    const product = {
      id: '10000000-0000-4000-8000-000000000011',
      sku: 'SP-FOCUS',
      barcode: null,
      name: 'Sản phẩm từ deeplink',
      categoryId: null,
      categoryName: null,
      unitName: 'Hộp',
      description: null,
      minStockQty: '0',
      isActive: true,
      version: 1,
      primaryImagePath: null,
      currentSalePrice: '25000.00',
      salePriceValidFrom: null,
      onHandQty: '4',
      images: [],
    };
    mocks.catalogDetail.mockResolvedValue(product);
    mocks.catalogList.mockImplementation(({ search }: { search?: string }) =>
      Promise.resolve({
        items: search === product.sku ? [product] : [],
        nextCursor: null,
      }),
    );

    renderPage(`/pos?focusProduct=${product.id}`);

    expect(
      await screen.findByText('Sản phẩm được mở từ liên kết'),
    ).toBeInTheDocument();
    expect(screen.getByText('Chưa có sản phẩm trong giỏ.')).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Tìm sản phẩm' })).toHaveValue(
      product.sku,
    );
    await user.click(screen.getByRole('button', { name: 'Thêm vào giỏ' }));
    expect(await screen.findByText(product.name)).toBeInTheDocument();
    expect(
      screen.queryByText('Chưa có sản phẩm trong giỏ.'),
    ).not.toBeInTheDocument();
  });

  it('prefills and appends an active deeplink customer without saving', async () => {
    const customer = {
      id: '30000000-0000-4000-8000-000000000001',
      code: 'KH-300',
      customerType: 'INDIVIDUAL',
      name: 'Khách ngoài trang đầu',
      phone: '+84912345678',
      email: null,
      address: null,
      companyName: null,
      taxCode: null,
      customerGroup: null,
      notes: null,
      isActive: true,
      version: 1,
      salesScope: 'NONE',
      purchaseSummary: null,
    };
    mocks.customerDetail.mockResolvedValue(customer);

    renderPage(`/pos?customerId=${customer.id}`);

    await waitFor(() =>
      expect(screen.getByLabelText('Khách hàng đã chọn')).toHaveTextContent(
        customer.name,
      ),
    );
    expect(screen.getByLabelText('Khách hàng đã chọn')).toBeInTheDocument();
  });

  it('requires confirmation before replacing a selected customer', async () => {
    const user = userEvent.setup();
    const current = {
      id: '30000000-0000-4000-8000-000000000002',
      name: 'Khách hiện tại',
      phone: null,
      isActive: true,
    };
    const target = {
      id: '30000000-0000-4000-8000-000000000003',
      code: null,
      customerType: 'INDIVIDUAL',
      name: 'Khách từ liên kết',
      phone: null,
      email: null,
      address: null,
      companyName: null,
      taxCode: null,
      customerGroup: null,
      notes: null,
      isActive: true,
      version: 1,
      salesScope: 'NONE',
      purchaseSummary: null,
    };
    mocks.listCustomers.mockResolvedValue({ items: [current] });
    mocks.customerDetail.mockResolvedValue(target);
    localStorage.setItem(
      'tuenhi:pos:cart:10000000-0000-4000-8000-000000000099',
      JSON.stringify({
        items: [],
        channelId: channels[0]!.id,
        customerId: current.id,
        orderDiscount: '0',
        note: '',
      }),
    );

    renderPage(`/pos?customerId=${target.id}`);

    expect(
      await screen.findByText('Khách hàng được mở từ liên kết'),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Khách hàng đã chọn')).toHaveTextContent(
      current.name,
    );
    await user.click(screen.getByRole('button', { name: 'Đổi khách hàng' }));
    expect(screen.getByLabelText('Khách hàng đã chọn')).toHaveTextContent(
      target.name,
    );
  });

  it('does not overwrite a customer selected while lookup is pending', async () => {
    const user = userEvent.setup();
    const selected = {
      id: '30000000-0000-4000-8000-000000000004',
      name: 'Khách vừa chọn',
      phone: null,
      isActive: true,
    };
    let resolveTarget!: (value: object) => void;
    mocks.listCustomers.mockResolvedValue({ items: [selected] });
    mocks.customerDetail.mockReturnValue(
      new Promise((resolve) => {
        resolveTarget = resolve;
      }),
    );
    const targetId = '30000000-0000-4000-8000-000000000005';
    renderPage(`/pos?customerId=${targetId}`);
    const select = await screen.findByLabelText('Khách hàng');
    await user.click(select);
    await user.click(
      await screen.findByRole('option', { name: 'Khách vừa chọn' }),
    );
    resolveTarget({
      id: targetId,
      code: null,
      customerType: 'INDIVIDUAL',
      name: 'Khách trả về muộn',
      phone: null,
      email: null,
      address: null,
      companyName: null,
      taxCode: null,
      customerGroup: null,
      notes: null,
      isActive: true,
      version: 1,
      salesScope: 'NONE',
      purchaseSummary: null,
    });

    expect(
      await screen.findByText('Khách hàng được mở từ liên kết'),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Khách hàng đã chọn')).toHaveTextContent(
      selected.name,
    );
  });

  it('keeps customer prefill read-only until taking over the lease', async () => {
    const user = userEvent.setup();
    const userId = '10000000-0000-4000-8000-000000000099';
    const targetId = '30000000-0000-4000-8000-000000000006';
    sessionStorage.setItem(
      'tuenhi:pos:tab-id',
      '20000000-0000-4000-8000-000000000002',
    );
    acquirePosEditorLease({
      userId,
      identity: { kind: 'NEW' },
      tabId: '20000000-0000-4000-8000-000000000001',
      now: new Date(),
    });
    mocks.customerDetail.mockResolvedValue({
      id: targetId,
      code: null,
      customerType: 'INDIVIDUAL',
      name: 'Khách từ tab khác',
      phone: null,
      email: null,
      address: null,
      companyName: null,
      taxCode: null,
      customerGroup: null,
      notes: null,
      isActive: true,
      version: 1,
      salesScope: 'NONE',
      purchaseSummary: null,
    });
    renderPage(`/pos?customerId=${targetId}`);

    const select = await screen.findByLabelText('Khách hàng');
    expect(select).toHaveValue('');
    await user.click(
      screen.getByRole('button', { name: 'Tiếp tục ở tab này' }),
    );
    await waitFor(() =>
      expect(screen.getByLabelText('Khách hàng đã chọn')).toHaveTextContent(
        'Khách từ tab khác',
      ),
    );
  });

  it('rejects malformed and inactive customer intents safely', async () => {
    const view = renderPage('/pos?customerId=not-a-uuid');
    expect(
      await screen.findByText(
        'Liên kết khách hàng không hợp lệ và đã được bỏ qua.',
      ),
    ).toBeInTheDocument();
    expect(mocks.customerDetail).not.toHaveBeenCalled();

    view.unmount();
    const inactiveId = '30000000-0000-4000-8000-000000000007';
    mocks.customerDetail.mockResolvedValue({
      id: inactiveId,
      name: 'Khách ngừng hoạt động',
      isActive: false,
    });
    renderPage(`/pos?customerId=${inactiveId}`);
    expect(
      await screen.findByText('Khách hàng trong liên kết đã ngừng hoạt động.'),
    ).toBeInTheDocument();
  });
});

it('locks checkout controls and provides recovery without requiring a new proof', async () => {
  mocks.checkoutPending = true;
  renderPage();
  expect(await screen.findByLabelText('Khách hàng')).toBeDisabled();
  expect(screen.getByLabelText('Kênh bán')).toBeDisabled();
  expect(screen.getByText(/Giao dịch ban đầu/)).toHaveTextContent('100.000');
  fireEvent.click(screen.getByRole('button', { name: 'Đối soát giao dịch' }));
  expect(mocks.reconcilePayment).toHaveBeenCalledOnce();
  expect(
    screen.queryByLabelText('Tải ảnh chứng từ chuyển khoản'),
  ).not.toBeInTheDocument();
});

// jsdom has no modal implementation; focus trapping is exercised in Playwright.
beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute('open');
  };
});
