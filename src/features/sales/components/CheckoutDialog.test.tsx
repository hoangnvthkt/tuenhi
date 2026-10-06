import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CheckoutDialog } from './CheckoutDialog';

beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute('open');
  };
});

describe('CheckoutDialog', () => {
  it('confirms a bank transfer without proof and accepts an optional attachment', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(
      <CheckoutDialog
        payment="BANK_TRANSFER"
        total="100000"
        saving={false}
        onPaymentChange={vi.fn()}
        onCancel={vi.fn()}
        onConfirm={onConfirm}
      />,
    );

    expect(screen.getByRole('button', { name: 'Xác nhận' })).toBeEnabled();
    await user.click(screen.getByRole('button', { name: 'Xác nhận' }));
    expect(onConfirm).toHaveBeenCalledWith(undefined);

    await user.upload(
      screen.getByLabelText('Tải ảnh chứng từ chuyển khoản'),
      new File(['image'], 'proof.jpg', { type: 'image/jpeg' }),
    );

    expect(screen.getByRole('button', { name: 'Xác nhận' })).toBeEnabled();
    await user.click(screen.getByRole('button', { name: 'Xác nhận' }));
    expect(onConfirm).toHaveBeenCalledWith(expect.any(File));
  });

  it('does not require a proof for cash', () => {
    render(
      <CheckoutDialog
        payment="CASH"
        total="100000"
        saving={false}
        onPaymentChange={vi.fn()}
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );

    expect(
      screen.queryByText('Cần ảnh chứng từ chuyển khoản để xác nhận.'),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Xác nhận' })).toBeEnabled();
  });

  it('confirms a valid cash payment with Ctrl+Enter', () => {
    const onConfirm = vi.fn();
    render(
      <CheckoutDialog
        payment="CASH"
        total="100000"
        saving={false}
        onPaymentChange={vi.fn()}
        onCancel={vi.fn()}
        onConfirm={onConfirm}
      />,
    );

    fireEvent.keyDown(window, { key: 'Enter', ctrlKey: true });

    expect(onConfirm).toHaveBeenCalledWith(undefined);
  });

  it('confirms a transfer without proof with Ctrl+Enter and closes with Escape', () => {
    const onCancel = vi.fn();
    const onConfirm = vi.fn();
    render(
      <CheckoutDialog
        payment="BANK_TRANSFER"
        total="100000"
        saving={false}
        onPaymentChange={vi.fn()}
        onCancel={onCancel}
        onConfirm={onConfirm}
      />,
    );

    fireEvent.keyDown(window, { key: 'Enter', ctrlKey: true });
    fireEvent.keyDown(window, { key: 'Escape' });

    expect(onConfirm).toHaveBeenCalledWith(undefined);
    expect(onCancel).toHaveBeenCalledOnce();
  });
});

it('locks payment method and cancellation while the confirmed command is running', async () => {
  const onPaymentChange = vi.fn();
  const onCancel = vi.fn();
  render(
    <CheckoutDialog
      payment="CASH"
      total="100000"
      saving
      onPaymentChange={onPaymentChange}
      onCancel={onCancel}
      onConfirm={vi.fn()}
    />,
  );
  await userEvent
    .setup()
    .click(screen.getByRole('button', { name: 'Chuyển khoản' }));
  await userEvent
    .setup()
    .click(screen.getByRole('button', { name: 'Quay lại' }));
  expect(onPaymentChange).not.toHaveBeenCalled();
  expect(onCancel).not.toHaveBeenCalled();
});

it('rechecks cash against a changed total and blocks both click and keyboard when short', () => {
  const onConfirm = vi.fn();
  const props = {
    payment: 'CASH' as const,
    total: '274000',
    saving: false,
    onConfirm,
    onCancel: vi.fn(),
    onPaymentChange: vi.fn(),
  };
  const view = render(<CheckoutDialog {...props} />);
  fireEvent.change(screen.getByLabelText('Khách đưa (tùy chọn)'), {
    target: { value: '300000' },
  });
  expect(screen.getByText(/Tiền thừa:/)).toHaveTextContent('26.000');
  view.rerender(<CheckoutDialog {...props} total="350000" />);
  expect(screen.getByText(/Còn thiếu:/)).toHaveTextContent('50.000');
  fireEvent.click(screen.getByRole('button', { name: 'Xác nhận' }));
  fireEvent.keyDown(window, { key: 'Enter', ctrlKey: true });
  expect(onConfirm).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText('Khách đưa (tùy chọn)'), {
    target: { value: '400000' },
  });
  fireEvent.keyDown(window, { key: 'Enter', ctrlKey: true });
  expect(onConfirm).toHaveBeenCalledWith(undefined);
});

it('clears cash help on payment switches and locks it while saving', () => {
  const props = {
    payment: 'CASH' as const,
    total: '100000',
    saving: false,
    onConfirm: vi.fn(),
    onCancel: vi.fn(),
    onPaymentChange: vi.fn(),
  };
  const view = render(<CheckoutDialog {...props} />);
  fireEvent.change(screen.getByLabelText('Khách đưa (tùy chọn)'), {
    target: { value: '200000' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Chuyển khoản' }));
  view.rerender(<CheckoutDialog {...props} payment="BANK_TRANSFER" />);
  expect(
    screen.queryByLabelText('Khách đưa (tùy chọn)'),
  ).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Xác nhận' })).toBeEnabled();
  fireEvent.click(screen.getByRole('button', { name: 'Tiền mặt' }));
  view.rerender(<CheckoutDialog {...props} saving />);
  expect(screen.getByLabelText('Khách đưa (tùy chọn)')).toHaveValue('');
  expect(screen.getByLabelText('Khách đưa (tùy chọn)')).toBeDisabled();
  fireEvent.keyDown(window, { key: 'Enter', ctrlKey: true });
  expect(props.onConfirm).not.toHaveBeenCalled();
});

it('opens a native modal so background navigation is inert while paying', () => {
  const show = vi.fn(function (this: HTMLDialogElement) {
    this.setAttribute('open', '');
  });
  HTMLDialogElement.prototype.showModal = show;
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute('open');
  };
  render(
    <CheckoutDialog
      payment="CASH"
      total="100000"
      saving={false}
      onConfirm={vi.fn()}
      onCancel={vi.fn()}
      onPaymentChange={vi.fn()}
    />,
  );
  expect(screen.getByRole('dialog').tagName).toBe('DIALOG');
  expect(show).toHaveBeenCalledOnce();
});

it('shows fractional shortfall and large change without rounding away money', () => {
  const props = {
    payment: 'CASH' as const,
    total: '100.01',
    saving: false,
    onConfirm: vi.fn(),
    onCancel: vi.fn(),
    onPaymentChange: vi.fn(),
  };
  const view = render(<CheckoutDialog {...props} />);
  fireEvent.change(screen.getByLabelText('Khách đưa (tùy chọn)'), {
    target: { value: '100' },
  });
  expect(screen.getByText(/Còn thiếu:/)).toHaveTextContent('0,01');
  view.rerender(<CheckoutDialog {...props} total="0" />);
  fireEvent.change(screen.getByLabelText('Khách đưa (tùy chọn)'), {
    target: { value: '9007199254740993.01' },
  });
  expect(screen.getByText(/Tiền thừa:/)).toHaveTextContent(
    '9.007.199.254.740.993,01',
  );
});

it('confirms KH01 with 30000 cash, 50000 transfer and 20000 debt without a proof', async () => {
  const user = userEvent.setup();
  const onConfirm = vi.fn();
  render(
    <CheckoutDialog
      payment={'SPLIT' as never}
      customerId="KH01"
      total="100000"
      saving={false}
      onPaymentChange={vi.fn()}
      onCancel={vi.fn()}
      onConfirm={onConfirm}
    />,
  );
  await user.type(screen.getByLabelText('Tiền mặt thanh toán'), '30000');
  await user.type(screen.getByLabelText('Chuyển khoản thanh toán'), '50000');
  expect(screen.getByText(/Còn nợ:/)).toHaveTextContent('20.000');
  await user.click(screen.getByRole('button', { name: 'Xác nhận' }));
  expect(onConfirm).toHaveBeenCalledWith(undefined, {
    cashAmount: '30000',
    bankTransferAmount: '50000',
  });
});

it('requires a customer only for the unpaid part of a split payment', () => {
  const props = {
    payment: 'SPLIT' as never,
    total: '100000',
    saving: false,
    onPaymentChange: vi.fn(),
    onCancel: vi.fn(),
    onConfirm: vi.fn(),
  };
  render(<CheckoutDialog {...props} />);
  expect(screen.getByRole('button', { name: 'Xác nhận' })).toBeDisabled();
  fireEvent.change(screen.getByLabelText('Tiền mặt thanh toán'), {
    target: { value: '100000' },
  });
  expect(screen.getByRole('button', { name: 'Xác nhận' })).toBeEnabled();
  fireEvent.change(screen.getByLabelText('Chuyển khoản thanh toán'), {
    target: { value: '1' },
  });
  expect(screen.getByRole('button', { name: 'Xác nhận' })).toBeDisabled();
  fireEvent.keyDown(window, { key: 'Enter', ctrlKey: true });
  expect(props.onConfirm).not.toHaveBeenCalled();
});
