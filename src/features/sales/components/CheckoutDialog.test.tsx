import { render, screen } from '@testing-library/react';
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
});
