import { renderWithQueryClient as render } from '@/shared/testing/render-with-query-client';
import { screen, within } from '@testing-library/react';
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
          itemsTotal="150000"
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

    expect(quantity).toHaveValue('1.000');
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
          itemsTotal="150000"
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

    expect(quantity).toHaveValue('999.999.999.999.999.999');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});

function DiscountCart({ canDiscount = true }: { canDiscount?: boolean }) {
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
      canDiscount={canDiscount}
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
      onRemoveLine={(id) =>
        setItems((current) => current.filter((item) => item.productId !== id))
      }
      onChannelChange={() => {}}
      onCustomerChange={() => {}}
      onNoteChange={() => {}}
      onSave={() => {}}
      onPrint={() => {}}
      onCheckout={() => {}}
    />
  );
}
async function applyDiscount(
  user: ReturnType<typeof userEvent.setup>,
  opener: HTMLElement,
  value: string,
  percent = false,
) {
  await user.click(opener);
  const dialog = screen.getByRole('dialog', { hidden: true });
  if (percent)
    await user.click(
      within(dialog).getByRole('button', { name: '%', hidden: true }),
    );
  const input = within(dialog).getByLabelText('Giảm giá');
  await user.clear(input);
  await user.type(input, value);
  await user.click(
    within(dialog).getByRole('button', { name: 'Áp dụng', hidden: true }),
  );
}

it('applies a 1000 VND line discount from the price and shows the line amount', async () => {
  const user = userEvent.setup();
  render(<DiscountCart />);
  await applyDiscount(
    user,
    screen.getByRole('button', { name: /^Giảm giá 12B Linh Chi/ }),
    '1000',
  );
  expect(screen.getByText(/Giảm -1\.000/)).toBeInTheDocument();
  expect(screen.getAllByText('54.000 ₫').length).toBeGreaterThan(0);
});

it('applies an order discount by percent on the amount after line discounts', async () => {
  const user = userEvent.setup();
  render(<DiscountCart />);
  const quantity = screen.getByLabelText('Số lượng');
  await user.clear(quantity);
  await user.type(quantity, '2');
  await user.tab();
  await applyDiscount(
    user,
    screen.getByRole('button', { name: /^Giảm giá 12B Linh Chi/ }),
    '10000',
  );
  await applyDiscount(
    user,
    screen.getByRole('button', { name: /Giảm giá đơn/ }),
    '10',
    true,
  );
  // 2 × 55.000 − 10.000 = 100.000; 10% đơn = 10.000 → 90.000
  expect(screen.getByText('-10.000 ₫')).toBeInTheDocument();
  expect(screen.getAllByText('90.000 ₫').length).toBeGreaterThan(0);
});

it('blocks a line discount above the line amount', async () => {
  const user = userEvent.setup();
  render(<DiscountCart />);
  await user.click(
    screen.getByRole('button', { name: /^Giảm giá 12B Linh Chi/ }),
  );
  const dialog = screen.getByRole('dialog', { hidden: true });
  await user.type(within(dialog).getByLabelText('Giảm giá'), '60000');
  expect(within(dialog).getByRole('alert', { hidden: true })).toHaveTextContent(
    'Không vượt quá tiền hàng.',
  );
  expect(
    within(dialog).getByRole('button', { name: 'Áp dụng', hidden: true }),
  ).toBeDisabled();
});

it('shows discount as denied without the discount permission', () => {
  render(<DiscountCart canDiscount={false} />);
  expect(
    screen.queryByRole('button', { name: /^Giảm giá 12B Linh Chi/ }),
  ).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: /Giảm giá đơn/ })).toBeDisabled();
  expect(screen.getByText('Không có quyền')).toBeInTheDocument();
});

it('changes quantity and removes the line when requested at quantity one', async () => {
  render(<DiscountCart />);
  const user = userEvent.setup();
  const quantity = screen.getByLabelText('Số lượng');
  await user.click(
    screen.getByRole('button', { name: 'Tăng số lượng 12B Linh Chi' }),
  );
  expect(quantity).toHaveValue('2');
  await user.click(
    screen.getByRole('button', { name: 'Giảm số lượng 12B Linh Chi' }),
  );
  expect(quantity).toHaveValue('1');

  const removeButtons = screen.getAllByRole('button', {
    name: 'Xóa 12B Linh Chi khỏi đơn',
  });
  expect(removeButtons).toHaveLength(2);
  removeButtons.forEach((button) => expect(button).toBeEnabled());
  const removeFromQuantityControl = within(
    screen.getByRole('group', { name: 'Số lượng 12B Linh Chi' }),
  ).getByRole('button', { name: 'Xóa 12B Linh Chi khỏi đơn' });
  await user.click(removeFromQuantityControl);
  expect(screen.queryByLabelText('Số lượng')).not.toBeInTheDocument();
  expect(screen.getByText('Chưa có sản phẩm trong giỏ.')).toBeInTheDocument();
});
