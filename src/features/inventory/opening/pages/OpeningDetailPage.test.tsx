import type { ReactElement } from 'react';
import {
  fireEvent,
  render,
  screen,
  waitFor,
  cleanup,
} from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Routes, Route } from 'react-router';
import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { OpeningDetailPage } from './OpeningDetailPage';
const mocks = vi.hoisted(() => ({
  stock: { detail: vi.fn(), save: vi.fn(), command: vi.fn() },
  opening: {
    detail: vi.fn(),
    save: vi.fn(),
    command: vi.fn(),
    suggestions: vi.fn(),
  },
  catalog: { list: vi.fn() },
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
  refreshOperationalData: vi.fn(),
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

describe('opening saved form', () => {
  function opening(qty = '5', version = 1) {
    return {
      ...stock(),
      version,
      totalValue: '500',
      lines: [
        {
          productId: 'product-a',
          countedQty: qty,
          openingUnitCost: '100',
          sourceSuggestionId: null,
          unverifiedSourceConfirmed: false,
        },
      ],
    };
  }
  it('requires saving visible changes before submitting with the new version', async () => {
    mocks.opening.detail
      .mockResolvedValueOnce(opening())
      .mockResolvedValue(opening('9', 2));
    mount(<OpeningDetailPage />, '/opening/doc');
    await waitFor(() =>
      expect(screen.getByLabelText('Tồn đầu kỳ')).toHaveValue('5'),
    );
    fireEvent.change(screen.getByLabelText('Tồn đầu kỳ'), {
      target: { value: '9' },
    });
    expect(screen.getByText('Hoàn tất kiểm đếm')).toBeDisabled();
    fireEvent.click(screen.getByText('Hoàn tất kiểm đếm'));
    expect(mocks.opening.command).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText('Lưu nháp'));
    await waitFor(() =>
      expect(screen.getByText('Hoàn tất kiểm đếm')).toBeEnabled(),
    );
    fireEvent.click(screen.getByText('Hoàn tất kiểm đếm'));
    await waitFor(() =>
      expect(mocks.opening.command).toHaveBeenCalledWith('submit', 'doc', 2),
    );
    expect(mocks.opening.save).toHaveBeenCalledWith(
      expect.objectContaining({
        lines: [expect.objectContaining({ countedQty: '9' })],
      }),
    );
  });
  it('keeps edits and blocks submit after save failure', async () => {
    mocks.opening.detail.mockResolvedValue(opening());
    mocks.opening.save.mockRejectedValueOnce(new Error('Không thể lưu'));
    mount(<OpeningDetailPage />, '/opening/doc');
    await waitFor(() =>
      expect(screen.getByLabelText('Tồn đầu kỳ')).toHaveValue('5'),
    );
    fireEvent.change(screen.getByLabelText('Tồn đầu kỳ'), {
      target: { value: '9' },
    });
    fireEvent.click(screen.getByText('Lưu nháp'));
    await screen.findByRole('alert');
    expect(screen.getByLabelText('Tồn đầu kỳ')).toHaveValue('9');
    expect(screen.getByText('Hoàn tất kiểm đếm')).toBeDisabled();
  });
});
