import { render, screen } from '@testing-library/react';
import { useState } from 'react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
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
