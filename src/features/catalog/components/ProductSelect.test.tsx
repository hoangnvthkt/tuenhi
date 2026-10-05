import { fireEvent, screen } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { renderWithQueryClient } from '@/shared/testing/render-with-query-client';
import { ProductSelect } from './ProductSelect';
const mocks = vi.hoisted(() => ({ list: vi.fn(), detail: vi.fn() }));
vi.mock('../api/catalog-api', () => ({ createCatalogApi: () => mocks }));
beforeEach(() => vi.clearAllMocks());
it('shows a read-only receipt snapshot for an inactive product outside the loaded catalog', () => {
  renderWithQueryClient(
    <ProductSelect
      label="Sản phẩm"
      value="old"
      readOnly
      selectedSnapshot={{ id: 'old', name: 'Tên trên phiếu', sku: 'OLD' }}
      onChange={vi.fn()}
    />,
  );
  expect(screen.getByText('OLD — Tên trên phiếu')).toBeVisible();
  expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
  expect(mocks.list).not.toHaveBeenCalled();
});
it('finds product101 remotely without selecting it automatically', async () => {
  mocks.list.mockImplementation(async ({ search }) => ({
    items: search
      ? [{ id: '101', name: 'Sản phẩm 101', sku: 'P101', isActive: true }]
      : [],
    nextCursor: null,
  }));
  const onChange = vi.fn();
  renderWithQueryClient(
    <ProductSelect label="Sản phẩm" value="" onChange={onChange} />,
  );
  fireEvent.change(screen.getByRole('combobox'), { target: { value: 'P101' } });
  const item = await screen.findByRole('option', {
    name: 'P101 — Sản phẩm 101',
  });
  expect(onChange).not.toHaveBeenCalled();
  fireEvent.click(item);
  expect(onChange).toHaveBeenCalledWith(
    '101',
    expect.objectContaining({ id: '101' }),
  );
});

it('selects SKU search results with Enter and omits duplicate products', async () => {
  const product = { id: 'a', name: 'Thuốc A', sku: 'THUOC-A', isActive: true };
  mocks.list.mockResolvedValue({ items: [product], nextCursor: null });
  const onChange = vi.fn();
  const view = renderWithQueryClient(
    <ProductSelect label="Sản phẩm" value="" onChange={onChange} />,
  );
  const input = screen.getByRole('combobox');
  fireEvent.change(input, { target: { value: 'THUOC-A' } });
  await screen.findByRole('option', { name: 'THUOC-A — Thuốc A' });
  fireEvent.keyDown(input, { key: 'Enter' });
  expect(onChange).toHaveBeenCalledWith(
    'a',
    expect.objectContaining({ id: 'a' }),
  );
  view.unmount();
  renderWithQueryClient(
    <ProductSelect
      label="Sản phẩm"
      value=""
      excludedIds={new Set(['a'])}
      onChange={onChange}
    />,
  );
  fireEvent.focus(screen.getByRole('combobox'));
  await screen.findByText('Không tìm thấy kết quả.');
  expect(screen.queryByRole('option')).not.toBeInTheDocument();
});
it('passes barcode search to the server and keeps inactive products out of new purchases', async () => {
  mocks.list.mockResolvedValue({ items: [], nextCursor: null });
  renderWithQueryClient(
    <ProductSelect label="Sản phẩm" value="" onChange={vi.fn()} />,
  );
  fireEvent.change(screen.getByRole('combobox'), {
    target: { value: '89300001' },
  });
  await screen.findByText('Không tìm thấy kết quả.');
  expect(mocks.list).toHaveBeenLastCalledWith(
    expect.objectContaining({ search: '89300001', includeInactive: false }),
  );
});

it('visibly highlights and scrolls the keyboard candidate before Enter selects it', async () => {
  const scroll = vi.fn();
  Element.prototype.scrollIntoView = scroll;
  mocks.list.mockResolvedValue({
    items: Array.from({ length: 20 }, (_, index) => ({
      id: String(index),
      name: `Hàng ${index}`,
      sku: `P${index}`,
      isActive: true,
    })),
    nextCursor: null,
  });
  const onChange = vi.fn();
  renderWithQueryClient(
    <ProductSelect label="Sản phẩm" value="" onChange={onChange} />,
  );
  const input = screen.getByRole('combobox');
  fireEvent.focus(input);
  await screen.findByRole('option', { name: 'P0 — Hàng 0' });
  for (let i = 0; i < 15; i++) fireEvent.keyDown(input, { key: 'ArrowDown' });
  const candidate = screen.getByRole('option', { name: 'P15 — Hàng 15' });
  expect(candidate).toHaveClass('bg-teal-100');
  expect(scroll).toHaveBeenLastCalledWith({ block: 'nearest' });
  expect(scroll.mock.instances.at(-1)).toBe(candidate);
  fireEvent.keyDown(input, { key: 'Enter' });
  expect(onChange).toHaveBeenCalledWith(
    '15',
    expect.objectContaining({ id: '15' }),
  );
});
