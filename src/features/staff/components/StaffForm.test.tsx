import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { StaffForm } from './StaffForm';

describe('StaffForm', () => {
  it('validates Vietnamese fields and excludes OWNER from role choices', async () => {
    const user = userEvent.setup();
    render(<StaffForm onSubmit={vi.fn()} />);

    expect(
      screen.queryByRole('option', { name: 'Chủ cửa hàng' }),
    ).not.toBeInTheDocument();
    await user.type(screen.getByLabelText('Email nhân viên'), 'email-sai');
    await user.click(screen.getByRole('button', { name: 'Tạo tài khoản' }));

    expect(
      await screen.findByText('Email chưa đúng định dạng.'),
    ).toBeInTheDocument();
    expect(screen.getByText('Vui lòng nhập tên hiển thị.')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Mật khẩu phải có ít nhất 10 ký tự, gồm chữ thường, chữ hoa và số.',
      ),
    ).toBeInTheDocument();
  });

  it('submits the temporary password without rendering it outside the form', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<StaffForm onSubmit={onSubmit} />);

    await user.type(screen.getByLabelText('Email nhân viên'), 'nv@example.com');
    await user.type(screen.getByLabelText('Tên hiển thị'), 'Nhân viên A');
    await user.selectOptions(screen.getByLabelText('Vai trò'), 'BUSINESS');
    await user.type(screen.getByLabelText('Mật khẩu tạm'), 'Matkhau123');
    await user.click(screen.getByRole('button', { name: 'Tạo tài khoản' }));

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'nv@example.com',
        displayName: 'Nhân viên A',
        roleTemplate: 'BUSINESS',
        temporaryPassword: 'Matkhau123',
      }),
    );
    expect(screen.queryByText('Matkhau123')).not.toBeInTheDocument();
  });

  it('creates an inventory-only account from the role selector', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<StaffForm onSubmit={onSubmit} />);
    await user.type(
      screen.getByLabelText('Email nhân viên'),
      'kho@example.com',
    );
    await user.type(screen.getByLabelText('Tên hiển thị'), 'Nhân viên kho');
    await user.selectOptions(
      screen.getByLabelText('Vai trò'),
      'WAREHOUSE_VIEWER',
    );
    await user.type(screen.getByLabelText('Mật khẩu tạm'), 'Matkhau123');
    await user.click(screen.getByRole('button', { name: 'Tạo tài khoản' }));
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ roleTemplate: 'WAREHOUSE_VIEWER' }),
    );
  });

  it('shows the safe actionable message returned by the staff API', async () => {
    const user = userEvent.setup();
    render(
      <StaffForm
        onSubmit={vi
          .fn()
          .mockRejectedValue(
            new Error(
              'Chưa thể tạo nhân viên. Hãy hoàn tất bảo vệ mật khẩu trước khi mở tài khoản nhân viên.',
            ),
          )}
      />,
    );

    await user.type(screen.getByLabelText('Email nhân viên'), 'nv@example.com');
    await user.type(screen.getByLabelText('Tên hiển thị'), 'Nhân viên A');
    await user.type(screen.getByLabelText('Mật khẩu tạm'), 'Matkhau123');
    await user.click(screen.getByRole('button', { name: 'Tạo tài khoản' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Chưa thể tạo nhân viên. Hãy hoàn tất bảo vệ mật khẩu trước khi mở tài khoản nhân viên.',
    );
  });
});
