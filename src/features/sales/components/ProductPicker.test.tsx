import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi, type Mock } from 'vitest';
import type { ProductCatalogItem } from '@/features/catalog';
import { ProductPicker } from './ProductPicker';

const products: ProductCatalogItem[] = [
  {
    id: '10000000-0000-4000-8000-000000000001',
    sku: 'AO-001',
    barcode: '893000000001',
    name: 'Áo dài xanh',
    categoryId: null,
    categoryName: null,
    unitName: 'Cái',
    minStockQty: '1',
    isActive: true,
    version: 1,
    primaryImagePath: null,
    currentSalePrice: '150000',
    onHandQty: '10',
  },
  {
    id: '10000000-0000-4000-8000-000000000002',
    sku: 'AO-002',
    barcode: '893000000002',
    name: 'Áo dài đỏ',
    categoryId: null,
    categoryName: null,
    unitName: 'Cái',
    minStockQty: '1',
    isActive: true,
    version: 1,
    primaryImagePath: null,
    currentSalePrice: '160000',
    onHandQty: '8',
  },
];

function renderPicker({
  search = 'áo',
  resolvedSearch = search,
  onAdd = vi.fn<(product: ProductCatalogItem) => void>(),
  onSearchChange = vi.fn<(value: string) => void>(),
  onExactLookup = vi
    .fn<(value: string) => Promise<ProductCatalogItem[]>>()
    .mockResolvedValue(products),
}: {
  search?: string;
  resolvedSearch?: string;
  onAdd?: Mock<(product: ProductCatalogItem) => void>;
  onSearchChange?: Mock<(value: string) => void>;
  onExactLookup?: Mock<(value: string) => Promise<ProductCatalogItem[]>>;
} = {}) {
  render(
    <ProductPicker
      search={search}
      resolvedSearch={resolvedSearch}
      products={products}
      isLoading={false}
      onSearchChange={onSearchChange}
      onExactLookup={onExactLookup}
      onAdd={onAdd}
    />,
  );
  return { onAdd, onSearchChange, onExactLookup };
}

describe('ProductPicker', () => {
  it('moves the highlighted result with arrow keys and adds it with Enter', async () => {
    const user = userEvent.setup();
    const { onAdd, onSearchChange } = renderPicker();
    const input = screen.getByRole('combobox', { name: 'Tìm sản phẩm' });

    await user.click(input);
    await user.keyboard('{ArrowDown}{Enter}');

    expect(onAdd).toHaveBeenCalledWith(products[1]);
    expect(onSearchChange).toHaveBeenCalledWith('');
    expect(input).toHaveFocus();
  });

  it('prioritizes the unique exact SKU even when it is not the first result', async () => {
    const user = userEvent.setup();
    const onAdd = vi.fn();
    renderPicker({ search: 'ao-002', onAdd });

    await user.click(screen.getByRole('combobox', { name: 'Tìm sản phẩm' }));
    await user.keyboard('{Enter}');

    expect(onAdd).toHaveBeenCalledWith(products[1]);
  });

  it('performs an exact lookup before adding when visible results are stale', async () => {
    const user = userEvent.setup();
    const onAdd = vi.fn();
    const onExactLookup = vi.fn().mockResolvedValue([products[1]]);
    renderPicker({
      search: '893000000002',
      resolvedSearch: 'áo',
      onAdd,
      onExactLookup,
    });

    await user.click(screen.getByRole('combobox', { name: 'Tìm sản phẩm' }));
    await user.keyboard('{Enter}');

    expect(onExactLookup).toHaveBeenCalledWith('893000000002');
    expect(onAdd).toHaveBeenCalledWith(products[1]);
  });

  it('does not add an arbitrary name result returned by a stale lookup', async () => {
    const user = userEvent.setup();
    const onAdd = vi.fn();
    const onExactLookup = vi.fn().mockResolvedValue(products);
    renderPicker({
      search: 'áo dài',
      resolvedSearch: 'áo',
      onAdd,
      onExactLookup,
    });

    await user.click(screen.getByRole('combobox', { name: 'Tìm sản phẩm' }));
    await user.keyboard('{Enter}');

    expect(onAdd).not.toHaveBeenCalled();
  });

  it('clears the search with Escape', async () => {
    const user = userEvent.setup();
    const { onSearchChange } = renderPicker();

    await user.click(screen.getByRole('combobox', { name: 'Tìm sản phẩm' }));
    await user.keyboard('{Escape}');

    expect(onSearchChange).toHaveBeenCalledWith('');
  });
});
