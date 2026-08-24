import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { StaffPage } from './StaffPage';
import type { StaffApi, StaffFeed } from '../api/staff-api';

const emptyFeed: StaffFeed = {
  items: [],
  permissionDefinitions: [],
  nextCursor: null,
};

const staffFeed: StaffFeed = {
  nextCursor: null,
  items: [
    {
      id: '00000000-0000-4000-8000-000000000201',
      email: 'nv@example.com',
      displayName: 'Nhân viên A',
      roleTemplate: 'SALES_WAREHOUSE',
      isActive: true,
      mustChangePassword: false,
      createdAt: '2026-08-22T04:00:00.000Z',
      overrides: [],
    },
  ],
  permissionDefinitions: [
    {
      code: 'staff.manage',
      category: 'Nhân viên',
      label: 'Quản lý nhân viên',
      description: 'Tạo, khóa và phân quyền nhân viên.',
      ownerOnly: true,
      salesWarehouseDefault: false,
      businessDefault: false,
    },
  ],
};

function createApi(overrides: Partial<StaffApi> = {}): StaffApi {
  return {
    list: vi.fn().mockResolvedValue(emptyFeed),
    create: vi.fn().mockResolvedValue(undefined),
    setActive: vi.fn().mockResolvedValue(undefined),
    setRole: vi.fn().mockResolvedValue(undefined),
    setPermissionOverride: vi.fn().mockResolvedValue(undefined),
    resetPassword: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function renderPage(api: StaffApi) {
  render(
    <QueryClientProvider
      client={
        new QueryClient({
          defaultOptions: {
            queries: { retry: false },
            mutations: { retry: false },
          },
        })
      }
    >
      <StaffPage api={api} />
    </QueryClientProvider>,
  );
}

describe('StaffPage', () => {
  it('shows a stable loading state and approved empty copy', async () => {
    let resolveFeed!: (feed: StaffFeed) => void;
    renderPage(
      createApi({
        list: vi.fn(
          () =>
            new Promise<StaffFeed>((resolve) => {
              resolveFeed = resolve;
            }),
        ),
      }),
    );

    expect(
      screen.getByText('Đang tải danh sách nhân viên…'),
    ).toBeInTheDocument();
    resolveFeed(emptyFeed);
    expect(await screen.findByText('Chưa có nhân viên.')).toBeInTheDocument();
  });

  it('shows safe Vietnamese error copy and retries', async () => {
    const user = userEvent.setup();
    const list = vi
      .fn()
      .mockRejectedValueOnce(new Error('raw sql'))
      .mockResolvedValueOnce(emptyFeed);
    renderPage(createApi({ list }));

    expect(
      await screen.findByText(
        'Không thể tải danh sách nhân viên. Vui lòng thử lại.',
      ),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Thử lại' }));
    expect(await screen.findByText('Chưa có nhân viên.')).toBeInTheDocument();
  });

  it('creates an employee and refreshes the list', async () => {
    const user = userEvent.setup();
    const create = vi.fn().mockResolvedValue(undefined);
    const list = vi.fn().mockResolvedValue(emptyFeed);
    renderPage(createApi({ create, list }));

    await user.click(screen.getByRole('button', { name: 'Thêm nhân viên' }));
    await user.type(screen.getByLabelText('Email nhân viên'), 'nv@example.com');
    await user.type(screen.getByLabelText('Tên hiển thị'), 'Nhân viên A');
    await user.type(screen.getByLabelText('Mật khẩu tạm'), 'Matkhau123');
    await user.click(screen.getByRole('button', { name: 'Tạo tài khoản' }));

    await waitFor(() => expect(create).toHaveBeenCalledOnce());
    await waitFor(() => expect(list).toHaveBeenCalledTimes(2));
  });

  it('locks owner-only permissions and can deactivate an employee with a reason', async () => {
    const user = userEvent.setup();
    const setActive = vi.fn().mockResolvedValue(undefined);
    renderPage(
      createApi({ list: vi.fn().mockResolvedValue(staffFeed), setActive }),
    );

    expect(await screen.findByText('Nhân viên A')).toBeInTheDocument();
    await user.click(screen.getByText('Phân quyền'));
    expect(screen.getByLabelText('Quản lý nhân viên')).toBeDisabled();

    await user.type(
      screen.getByLabelText('Lý do thay đổi trạng thái'),
      'Nhân viên nghỉ việc',
    );
    await user.click(screen.getByRole('button', { name: 'Khóa tài khoản' }));
    await waitFor(() =>
      expect(setActive).toHaveBeenCalledWith(
        expect.objectContaining({
          active: false,
          reason: 'Nhân viên nghỉ việc',
        }),
      ),
    );
  });
});
