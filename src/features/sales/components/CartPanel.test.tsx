import { renderWithQueryClient as render } from '@/shared/testing/render-with-query-client';
import { screen } from '@testing-library/react';
import { useState } from 'react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { calculatePosTotals } from '../model/pos-totals';
import { CartPanel } from './CartPanel';

describe('CartPanel', () => {
  it('accepts a four-digit whole quantity', async () => {
    const user = userEvent.setup();
    const CartPanelHarness = () => {
      const [items, setItems] = useState([
        {
          productId: '10000000-0000-4000-8000-000000000001',
          productName: 'Sản phẩm',
          sku: 'SP-001',
          unitName: 'Cái',
          quantity: '1',
          unitSalePrice: '150000',
          lineDiscountAmount: '0',
          lineOrder: 0,
          onHandQty: '1000',
        },
      ]);
      return (
        <CartPanel
          items={items}
          channels={[]}
          customers={[]}
          channelId=""
          customerId=""
          orderDiscount="0"
          note=""
          subtotal="150000"
          discountTotal="0"
          total="150000"
          canDiscount
          online
          saving={false}
          onUpdateLine={(id, field, value) =>
            setItems((current) =>
              current.map((item) =>
                item.productId === id ? { ...item, [field]: value } : item,
              ),
            )
          }
          onRemoveLine={vi.fn()}
          onChannelChange={vi.fn()}
          onCustomerChange={vi.fn()}
          onOrderDiscountChange={vi.fn()}
          onNoteChange={vi.fn()}
          onPrint={vi.fn()}
          onSave={vi.fn()}
          onCheckout={vi.fn()}
        />
      );
    };
    render(<CartPanelHarness />);

    const quantity = screen.getByLabelText('Số lượng');
    await user.clear(quantity);
    await user.type(quantity, '1000');
    await user.tab();

    expect(quantity).toHaveValue('1000');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('accepts the numeric(18,0) quantity boundary', async () => {
    const user = userEvent.setup();
    const CartPanelHarness = () => {
      const [items, setItems] = useState([
        {
          productId: '10000000-0000-4000-8000-000000000001',
          productName: 'Sản phẩm',
          sku: 'SP-001',
          unitName: 'Cái',
          quantity: '1',
          unitSalePrice: '150000',
          lineDiscountAmount: '0',
          lineOrder: 0,
          onHandQty: '999999999999999999',
        },
      ]);
      return (
        <CartPanel
          items={items}
          channels={[]}
          customers={[]}
          channelId=""
          customerId=""
          orderDiscount="0"
          note=""
          subtotal="150000"
          discountTotal="0"
          total="150000"
          canDiscount
          online
          saving={false}
          onUpdateLine={(id, field, value) =>
            setItems((current) =>
              current.map((item) =>
                item.productId === id ? { ...item, [field]: value } : item,
              ),
            )
          }
          onRemoveLine={vi.fn()}
          onChannelChange={vi.fn()}
          onCustomerChange={vi.fn()}
          onOrderDiscountChange={vi.fn()}
          onNoteChange={vi.fn()}
          onPrint={vi.fn()}
          onSave={vi.fn()}
          onCheckout={vi.fn()}
        />
      );
    };
    render(<CartPanelHarness />);

    const quantity = screen.getByLabelText('Số lượng');
    await user.clear(quantity);
    await user.type(quantity, '999999999999999999');
    await user.tab();

    expect(quantity).toHaveValue('999999999999999999');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});

function DiscountCart() {
  const [items, setItems] = useState([
    {
      productId: 'p',
      productName: '12B Linh Chi',
      sku: 'SP527697',
      unitName: 'Hộp',
      quantity: '1',
      unitSalePrice: '55000',
      lineDiscountAmount: '0',
      lineOrder: 0,
      onHandQty: '10',
    },
  ]);
  const [orderDiscount, setOrderDiscount] = useState('0');
  return (
    <CartPanel
      items={items}
      channels={[]}
      customers={[]}
      channelId=""
      customerId=""
      orderDiscount={orderDiscount}
      note=""
      {...calculatePosTotals(items, orderDiscount)}
      canDiscount
      online
      saving={false}
      onUpdateLine={(id, field, value) =>
        setItems((current) =>
          current.map((item) =>
            item.productId === id ? { ...item, [field]: value } : item,
          ),
        )
      }
      onOrderDiscountChange={setOrderDiscount}
      onRemoveLine={() => {}}
      onChannelChange={() => {}}
      onCustomerChange={() => {}}
      onNoteChange={() => {}}
      onSave={() => {}}
      onPrint={() => {}}
      onCheckout={() => {}}
    />
  );
}
it.each(['Giảm dòng', 'Giảm toàn đơn'])(
  'accepts a 1000 VND discount in %s and computes 54000',
  async (label) => {
    const user = userEvent.setup();
    render(<DiscountCart />);
    const input = screen.getByLabelText(label);
    await user.clear(input);
    await user.type(input, '1000');
    await user.tab();
    expect(input).toHaveValue('1000');
    expect(input).toHaveAttribute('aria-invalid', 'false');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getAllByText('54.000 ₫').length).toBeGreaterThan(0);
  },
);
it('treats line discount as the whole row amount, separately from order discount', async () => {
  const user = userEvent.setup();
  render(<DiscountCart />);
  for (const [label, value] of [
    ['Số lượng', '2'],
    ['Giảm dòng', '1000'],
    ['Giảm toàn đơn', '500'],
  ]) {
    const input = screen.getByLabelText(label!);
    await user.clear(input);
    await user.type(input, value!);
    await user.tab();
  }
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  expect(screen.getAllByText('108.500 ₫').length).toBeGreaterThan(0);
});
