import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { beforeEach, expect, it, vi } from 'vitest';
import { ReturnCreatePage } from './ReturnCreatePage';
const mocks = vi.hoisted(() => ({ lookupInvoice: vi.fn(), create: vi.fn() }));
vi.mock('../api/returns-api', () => ({ createReturnsApi: () => mocks }));
vi.mock('@/features/sales', () => ({ createSalesApi: () => ({}) }));
vi.mock('@/shared/ui/feedback/use-toast', () => ({
  useToast: () => ({ show: vi.fn() }),
}));
beforeEach(() => {
  vi.clearAllMocks();
  mocks.create.mockResolvedValue({ returnId: 'return' });
  mocks.lookupInvoice.mockResolvedValue({
    saleId: 'sale',
    saleNumber: 'HD1',
    completedAt: '2026-10-03',
    customerName: null,
    lines: [
      {
        id: 'a',
        productId: 'pa',
        productName: 'Đã trả hết',
        sku: 'A',
        unitName: 'Hộp',
        soldQty: '1',
        returnedQty: '1',
        returnableQty: '0',
        netAmount: '10',
      },
      {
        id: 'b',
        productId: 'pb',
        productName: 'Còn trả',
        sku: 'B',
        unitName: 'Hộp',
        soldQty: '1',
        returnedQty: '0',
        returnableQty: '1',
        netAmount: '10',
      },
    ],
  });
});
async function mount() {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter>
        <ReturnCreatePage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  fireEvent.change(screen.getByPlaceholderText('Ví dụ: HD000001'), {
    target: { value: 'HD1' },
  });
  fireEvent.click(screen.getByText('Tra cứu'));
  await screen.findByText('Còn trả');
  fireEvent.change(screen.getByLabelText('Lý do trả hàng'), {
    target: { value: 'Khách trả' },
  });
}
it('ignores exhausted zero lines and submits only the remaining item', async () => {
  await mount();
  fireEvent.click(screen.getByText('Gửi yêu cầu trả hàng'));
  await waitFor(() =>
    expect(mocks.create).toHaveBeenCalledWith(
      expect.objectContaining({
        lines: [{ originalSaleLineId: 'b', requestedQty: '1' }],
      }),
    ),
  );
});
it.each(['0', ''])(
  'requires a selected positive line when remaining input is %s',
  async (qty) => {
    await mount();
    fireEvent.change(screen.getAllByLabelText('Số lượng yêu cầu trả')[1]!, {
      target: { value: qty },
    });
    fireEvent.click(screen.getByText('Gửi yêu cầu trả hàng'));
    expect(mocks.create).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toBeVisible();
  },
);
