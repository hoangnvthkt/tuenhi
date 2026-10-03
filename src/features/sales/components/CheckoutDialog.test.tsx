import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { CheckoutDialog } from './CheckoutDialog';

describe('CheckoutDialog', () => {
  it('requires a transfer proof before confirming a bank-transfer payment', async () => {
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

    expect(
      screen.getByText('Cần ảnh chứng từ chuyển khoản để xác nhận.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Xác nhận' })).toBeDisabled();

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

  it('closes with Escape and never confirms a transfer without proof', () => {
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

    expect(onConfirm).not.toHaveBeenCalled();
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
