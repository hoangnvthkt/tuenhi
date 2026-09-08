import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { PurchaseProductCombobox } from './PurchaseProductCombobox';

const products = [
  {
    id: '10000000-0000-4000-8000-000000000001',
    sku: 'THUOC-A',
    barcode: '893000000001',
    name: 'Thuốc A',
    unitName: 'Hộp',
    isActive: true,
  },
  {
    id: '10000000-0000-4000-8000-000000000002',
    sku: 'NGUNG-BAN',
    barcode: null,
    name: 'Hàng ngừng bán',
    unitName: 'Cái',
    isActive: false,
  },
];

describe('PurchaseProductCombobox', () => {
  it('finds by SKU and selects the active result with Enter', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(
      <PurchaseProductCombobox
        label="Sản phẩm dòng 1"
        products={products}
        selectedProductId=""
        selectedProductIds={new Set()}
        onSelect={onSelect}
      />,
    );

    const input = screen.getByRole('combobox', { name: 'Sản phẩm dòng 1' });
    await user.type(input, 'THUOC-A');
    expect(screen.getByRole('option', { name: /THUOC-A.*Thuốc A/i })).toBeInTheDocument();

    await user.keyboard('{Enter}');

    expect(onSelect).toHaveBeenCalledWith(products[0]!.id);
  });

  it('finds by barcode but omits inactive and duplicate products', async () => {
    const user = userEvent.setup();
    render(
      <PurchaseProductCombobox
        label="Sản phẩm dòng 2"
        products={products}
        selectedProductId=""
        selectedProductIds={new Set([products[0]!.id])}
        onSelect={vi.fn()}
      />,
    );

    const input = screen.getByRole('combobox', { name: 'Sản phẩm dòng 2' });
    await user.type(input, '893000000001');

    expect(screen.queryByRole('option')).not.toBeInTheDocument();
    await user.clear(input);
    await user.type(input, 'ngừng');
    expect(screen.queryByRole('option')).not.toBeInTheDocument();
  });
});
