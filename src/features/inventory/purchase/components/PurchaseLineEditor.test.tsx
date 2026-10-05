import { useState } from 'react';
import { MemoryRouter } from 'react-router';
import { fireEvent, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, it, vi } from 'vitest';
import { renderWithQueryClient } from '@/shared/testing/render-with-query-client';
import { PurchaseLineEditor } from './PurchaseLineEditor';
import type { PurchaseDraftLine } from '../model/purchase-draft';
const api = vi.hoisted(() => ({ list: vi.fn(), detail: vi.fn() }));
vi.mock('@/features/catalog/api/catalog-api', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  createCatalogApi: () => api,
}));
const products = [
  {
    id: 'a',
    name: 'Hàng A',
    sku: 'A',
    isActive: true,
    defaultCost: '30000.50',
  },
  { id: 'b', name: 'Hàng B', sku: 'B', isActive: true, defaultCost: null },
];
beforeEach(() => {
  vi.clearAllMocks();
  api.list.mockResolvedValue({ items: products, nextCursor: null });
});
function Fixture({ canEnterCost = true }: { canEnterCost?: boolean }) {
  const [lines, setLines] = useState<PurchaseDraftLine[]>([
    { productId: '', receivedQty: '1', unitCost: '' },
  ]);
  const [costs, setCosts] = useState({});
  return (
    <MemoryRouter>
      <PurchaseLineEditor
        lines={lines}
        setLines={setLines}
        costs={costs}
        setCosts={setCosts}
        products={[]}
        receipt={null}
        editable
        canPost={false}
        canEnterCost={canEnterCost}
        lineProductIds={new Set()}
        canViewProduct={false}
        resolveProducts={async () => []}
      />
    </MemoryRouter>
  );
}
async function choose(name: string) {
  fireEvent.focus(screen.getByRole('combobox'));
  fireEvent.click(await screen.findByRole('option', { name }));
}
it('prefills selected product cost and preserves a receipt-specific override when the same product is reselected', async () => {
  const user = userEvent.setup();
  renderWithQueryClient(<Fixture />);
  await choose('A — Hàng A');
  expect(screen.getByLabelText('Đơn giá nhập')).toHaveValue('30000.50');
  await user.clear(screen.getByLabelText('Đơn giá nhập'));
  await user.type(screen.getByLabelText('Đơn giá nhập'), '29000');
  await choose('A — Hàng A');
  expect(screen.getByLabelText('Đơn giá nhập')).toHaveValue('29000');
  await choose('B — Hàng B');
  expect(screen.getByLabelText('Đơn giá nhập')).toHaveValue('');
  await choose('A — Hàng A');
  expect(screen.getByLabelText('Đơn giá nhập')).toHaveValue('30000.50');
});
it('does not expose a cost editor without cost entry permission', async () => {
  renderWithQueryClient(<Fixture canEnterCost={false} />);
  await choose('A — Hàng A');
  expect(screen.queryByLabelText('Đơn giá nhập')).not.toBeInTheDocument();
});
