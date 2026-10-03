import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, it, vi } from 'vitest';
import { StaffActions } from './StaffActions';
import {
  StaffRecoveryError,
  type StaffApi,
  type StaffMember,
} from '../api/staff-api';
const member: StaffMember = {
  id: '00000000-0000-4000-8000-000000000001',
  email: 'a@example.com',
  displayName: 'An',
  roleTemplate: 'BUSINESS',
  isActive: false,
  mustChangePassword: false,
  createdAt: '2026-10-03T00:00:00Z',
  overrides: [],
};
const done = {
  authReactivationPending: false,
  authSessionRevocationPending: false,
};
beforeEach(() => localStorage.clear());
it('keeps a partial activation bound to its original key/target/reason and does not report success', async () => {
  const user = userEvent.setup();
  const setActive = vi
    .fn()
    .mockResolvedValueOnce({ ...done, authReactivationPending: true })
    .mockResolvedValueOnce(done);
  const refresh = vi.fn();
  const view = render(
    <StaffActions
      actorId="owner"
      api={{ setActive } as unknown as StaffApi}
      member={member}
      permissions={[]}
      refresh={refresh}
    />,
  );
  await user.type(
    screen.getByLabelText('Lý do thay đổi trạng thái'),
    'Trở lại làm việc',
  );
  await user.dblClick(screen.getByRole('button', { name: 'Mở lại tài khoản' }));
  expect(setActive).toHaveBeenCalledTimes(1);
  expect(refresh).not.toHaveBeenCalledWith();
  expect(
    await screen.findByText(/chưa hoàn tất mở quyền đăng nhập/),
  ).toBeVisible();
  const first = setActive.mock.calls[0]![0];
  view.rerender(
    <StaffActions
      actorId="owner"
      api={{ setActive } as unknown as StaffApi}
      member={{ ...member, isActive: true }}
      permissions={[]}
      refresh={refresh}
    />,
  );
  expect(screen.getByRole('button', { name: 'Khóa tài khoản' })).toBeDisabled();
  await user.click(
    screen.getByRole('button', { name: 'Tiếp tục mở quyền đăng nhập' }),
  );
  expect(setActive).toHaveBeenLastCalledWith(first);
  expect(refresh).toHaveBeenCalledWith();
  expect(JSON.stringify(localStorage)).not.toContain(first.idempotencyKey);
});
it('reload resumes only the recorded operation without persisting a private reason', async () => {
  const user = userEvent.setup();
  const setActive = vi
    .fn()
    .mockRejectedValueOnce(
      new StaffRecoveryError('STAFF_UPDATE_OUTCOME_UNKNOWN', null, null, true),
    )
    .mockResolvedValueOnce(done);
  const props = {
    actorId: 'owner',
    api: { setActive } as unknown as StaffApi,
    member,
    permissions: [],
    refresh: vi.fn(),
  };
  const view = render(<StaffActions {...props} />);
  await user.type(
    screen.getByLabelText('Lý do thay đổi trạng thái'),
    'Lý do riêng tư',
  );
  await user.click(screen.getByRole('button', { name: 'Mở lại tài khoản' }));
  await screen.findByRole('button', { name: 'Tiếp tục mở quyền đăng nhập' });
  const first = setActive.mock.calls[0]![0];
  expect(JSON.stringify(localStorage)).not.toContain('Lý do riêng tư');
  view.unmount();
  render(<StaffActions {...props} member={{ ...member, isActive: true }} />);
  await user.click(
    screen.getByRole('button', { name: 'Tiếp tục mở quyền đăng nhập' }),
  );
  await waitFor(() =>
    expect(setActive).toHaveBeenLastCalledWith({
      userId: member.id,
      active: true,
      idempotencyKey: first.idempotencyKey,
      resume: true,
    }),
  );
});

it('keeps a stale marker blocked until explicitly dismissed without another Auth request', async () => {
  const user = userEvent.setup();
  const setActive = vi
    .fn()
    .mockRejectedValue(new StaffRecoveryError('STAFF_RECOVERY_STALE'));
  const refresh = vi.fn();
  render(
    <StaffActions
      actorId="owner"
      api={{ setActive } as unknown as StaffApi}
      member={member}
      permissions={[]}
      refresh={refresh}
    />,
  );
  await user.type(
    screen.getByLabelText('Lý do thay đổi trạng thái'),
    'Trở lại',
  );
  await user.click(screen.getByRole('button', { name: 'Mở lại tài khoản' }));
  expect(
    await screen.findByRole('button', { name: 'Tiếp tục mở quyền đăng nhập' }),
  ).toBeDisabled();
  await user.click(
    screen.getByRole('button', { name: 'Bỏ yêu cầu đã lỗi thời' }),
  );
  expect(setActive).toHaveBeenCalledTimes(1);
  expect(refresh).toHaveBeenCalledWith(null);
});

it.each(['AUTH_REQUIRED', 'PERMISSION_DENIED', 'INTERNAL_ERROR'])(
  'preserves the unfinished reactivation across %s on retry',
  async (code) => {
    const user = userEvent.setup();
    const setActive = vi
      .fn()
      .mockResolvedValueOnce({ ...done, authReactivationPending: true })
      .mockRejectedValueOnce(new StaffRecoveryError(code))
      .mockResolvedValueOnce(done);
    const refresh = vi.fn();
    const props = {
      actorId: 'owner',
      api: { setActive } as unknown as StaffApi,
      member,
      permissions: [],
      refresh,
    };
    const view = render(<StaffActions {...props} />);
    await user.type(
      screen.getByLabelText('Lý do thay đổi trạng thái'),
      'Trở lại',
    );
    await user.click(screen.getByRole('button', { name: 'Mở lại tài khoản' }));
    const first = setActive.mock.calls[0]![0];
    view.rerender(
      <StaffActions {...props} member={{ ...member, isActive: true }} />,
    );
    await user.click(
      await screen.findByRole('button', {
        name: 'Tiếp tục mở quyền đăng nhập',
      }),
    );
    await waitFor(() => expect(setActive).toHaveBeenCalledTimes(2));
    expect(JSON.stringify(localStorage)).toContain(first.idempotencyKey);
    expect(
      screen.getByRole('button', { name: 'Tiếp tục mở quyền đăng nhập' }),
    ).toBeEnabled();
    expect(
      screen.getByRole('button', { name: 'Khóa tài khoản' }),
    ).toBeDisabled();
    expect(refresh).not.toHaveBeenCalledWith();
    await user.click(
      screen.getByRole('button', { name: 'Tiếp tục mở quyền đăng nhập' }),
    );
    expect(setActive).toHaveBeenLastCalledWith(first);
    expect(refresh).toHaveBeenCalledWith();
  },
);
