import type { ReactElement } from 'react';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  cleanup,
} from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Routes, Route } from 'react-router';
import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { StockCountDetailPage } from './StockCountDetailPage';
const mocks = vi.hoisted(() => ({
  stock: { detail: vi.fn(), save: vi.fn(), command: vi.fn() },
  opening: {
    detail: vi.fn(),
    save: vi.fn(),
    command: vi.fn(),
    suggestions: vi.fn(),
  },
  catalog: { list: vi.fn() },
  refresh: vi.fn(),
}));
vi.mock('@/features/inventory/stock-count/api/stock-count-api', () => ({
  createStockCountApi: () => mocks.stock,
}));
vi.mock('@/features/inventory/opening/api/opening-api', () => ({
  createOpeningApi: () => mocks.opening,
}));
vi.mock('@/features/catalog', () => ({
  createCatalogApi: () => mocks.catalog,
}));
vi.mock('@/features/auth', () => ({
  useSession: () => ({ session: { userId: 'owner' } }),
}));
vi.mock('@/shared/hooks/use-financial-command', () => ({
  useFinancialCommand: () => vi.fn(),
}));
vi.mock('@/shared/hooks/use-online-status', () => ({
  useOnlineStatus: () => true,
}));
vi.mock('@/shared/api/refresh-operational-data', () => ({
  refreshOperationalData: mocks.refresh,
}));
vi.mock('@/shared/ui/feedback/use-toast', () => ({
  useToast: () => ({ show: vi.fn() }),
}));
const product = {
  id: 'product-a',
  name: 'Product A',
  sku: 'A',
  isActive: true,
};
function mount(element: ReactElement, path: string) {
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path={path.replace('/doc', '/:countId')} element={element} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}
function stock(status = 'DRAFT', qty: string | null = '5') {
  return {
    id: 'doc',
    version: 1,
    status,
    note: '',
    canPost: true,
    lines: [
      {
        id: 'line',
        productId: 'product-a',
        productName: 'Product A',
        countedQty: qty,
        systemQtySnapshot: '10',
        differenceQty: '-5',
      },
    ],
  };
}
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

beforeEach(() => {
  mocks.catalog.list.mockResolvedValue({ items: [product], nextCursor: null });
  mocks.opening.suggestions.mockResolvedValue({ items: [] });
  mocks.stock.command.mockResolvedValue({});
  mocks.stock.save.mockResolvedValue({});
  mocks.opening.command.mockResolvedValue({});
  mocks.opening.save.mockResolvedValue({});
});

describe('stock count saved form', () => {
  it('requires saving changed counts before submitting with the new version', async () => {
    mocks.stock.detail
      .mockResolvedValueOnce(stock())
      .mockResolvedValue({ ...stock('DRAFT', '9'), version: 2 });
    mount(<StockCountDetailPage />, '/stock-counts/doc');
    fireEvent.change(await screen.findByLabelText('Số đếm thực tế'), {
      target: { value: '9' },
    });
    expect(screen.getByText('Gửi phiếu để ghi sổ')).toBeDisabled();
    fireEvent.click(screen.getByText('Gửi phiếu để ghi sổ'));
    expect(mocks.stock.command).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText('Lưu phiếu'));
    await waitFor(() =>
      expect(screen.getByText('Gửi phiếu để ghi sổ')).toBeEnabled(),
    );
    fireEvent.click(screen.getByText('Gửi phiếu để ghi sổ'));
    await waitFor(() =>
      expect(mocks.stock.command).toHaveBeenCalledWith('submit', 'doc', 2, ''),
    );
  });
  it('clears counts on recount and prevents submit until every product is counted and saved', async () => {
    mocks.stock.detail
      .mockResolvedValueOnce(stock('COUNTED'))
      .mockResolvedValue({ ...stock('DRAFT', null), version: 2 });
    mount(<StockCountDetailPage />, '/stock-counts/doc');
    fireEvent.click(await screen.findByText('Cập nhật tồn & đếm lại'));
    expect(await screen.findByLabelText('Số đếm thực tế')).toHaveValue('');
    expect(screen.getByText('Gửi phiếu để ghi sổ')).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Số đếm thực tế'), {
      target: { value: '0' },
    });
    expect(screen.getByText('Gửi phiếu để ghi sổ')).toBeDisabled();
    mocks.stock.detail.mockResolvedValue({
      ...stock('DRAFT', '0'),
      version: 3,
    });
    fireEvent.click(screen.getByText('Lưu phiếu'));
    await waitFor(() =>
      expect(screen.getByText('Gửi phiếu để ghi sổ')).toBeEnabled(),
    );
  });
  it('keeps edits and blocks submit after save failure', async () => {
    mocks.stock.detail.mockResolvedValue(stock());
    mocks.stock.save.mockRejectedValueOnce(new Error('Không thể lưu'));
    mount(<StockCountDetailPage />, '/stock-counts/doc');
    fireEvent.change(await screen.findByLabelText('Số đếm thực tế'), {
      target: { value: '9' },
    });
    fireEvent.click(screen.getByText('Lưu phiếu'));
    await screen.findByRole('alert');
    expect(screen.getByLabelText('Số đếm thực tế')).toHaveValue('9');
    expect(screen.getByText('Gửi phiếu để ghi sổ')).toBeDisabled();
  });
});

it('locks all form inputs until the save and detail reload finish', async () => {
  let finish!: (value: unknown) => void;
  mocks.stock.detail.mockResolvedValue(stock());
  mocks.stock.save.mockReturnValueOnce(
    new Promise((resolve) => {
      finish = resolve;
    }),
  );
  mount(<StockCountDetailPage />, '/stock-counts/doc');
  fireEvent.change(await screen.findByLabelText('Số đếm thực tế'), {
    target: { value: '9' },
  });
  fireEvent.click(screen.getByText('Lưu phiếu'));
  expect(screen.getByLabelText('Ghi chú')).toBeDisabled();
  expect(screen.getByLabelText('Số đếm thực tế')).toBeDisabled();
  expect(screen.getByText('Thêm sản phẩm')).toBeDisabled();
  mocks.stock.detail.mockResolvedValue({ ...stock('DRAFT', '9'), version: 2 });
  finish({});
  await waitFor(() =>
    expect(screen.getByLabelText('Số đếm thực tế')).toBeEnabled(),
  );
  expect(screen.getByLabelText('Số đếm thực tế')).toHaveValue('9');
});

it('unlocks the saved document when creation navigates before refresh finishes', async () => {
  let finish!: () => void;
  mocks.refresh.mockReturnValueOnce(
    new Promise<void>((resolve) => {
      finish = resolve;
    }),
  );
  mocks.stock.save.mockResolvedValueOnce({ countId: 'doc' });
  mocks.stock.detail.mockResolvedValue(stock());
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={['/stock-counts/new']}>
        <Routes>
          <Route
            path="/stock-counts/new"
            element={<StockCountDetailPage mode="create" />}
          />
          <Route
            path="/stock-counts/:countId"
            element={<StockCountDetailPage />}
          />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  await screen.findByText('A — Product A');
  fireEvent.change(screen.getByRole('combobox'), {
    target: { value: 'product-a' },
  });
  fireEvent.change(screen.getByLabelText('Số đếm thực tế'), {
    target: { value: '5' },
  });
  fireEvent.click(screen.getByText('Lưu phiếu'));
  await waitFor(() => expect(mocks.stock.detail).toHaveBeenCalledWith('doc'));
  await act(async () => {
    finish?.();
  });
  await waitFor(() =>
    expect(screen.getByLabelText('Số đếm thực tế')).toBeEnabled(),
  );
  expect(screen.getByText('Lưu phiếu')).toBeEnabled();
});
