import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { StaffPage } from './StaffPage';
import {
  StaffRecoveryError,
  type StaffApi,
  type StaffFeed,
} from '../api/staff-api';

const emptyFeed: StaffFeed = {
  items: [],
  permissionDefinitions: [],
  nextCursor: null,
};

const blockedCapability = {
  canCreate: false,
  policy: 'BLOCKED' as const,
  message:
    'Chưa được phê duyệt tạo nhân viên. Chủ cửa hàng cần xác nhận chính sách tài khoản trước.',
};

const ownerWaiverCapability = {
  canCreate: true,
  policy: 'OWNER_WAIVER' as const,
  message:
    'Đang dùng ngoại lệ Owner: Supabase Free không kiểm tra mật khẩu đã bị rò rỉ.',
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
    getAccessCapability: vi.fn().mockResolvedValue(blockedCapability),
    create: vi.fn().mockResolvedValue(undefined),
    setActive: vi.fn().mockResolvedValue({
      authReactivationPending: false,
      authSessionRevocationPending: false,
    }),
    setRole: vi.fn().mockResolvedValue(undefined),
    setPermissionOverride: vi.fn().mockResolvedValue(undefined),
    resetPassword: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function renderPage(api: StaffApi) {
  return render(
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
    renderPage(
      createApi({
        create,
        list,
        getAccessCapability: vi.fn().mockResolvedValue(ownerWaiverCapability),
      }),
    );

    await user.click(screen.getByRole('button', { name: 'Thêm nhân viên' }));
    await user.type(screen.getByLabelText('Email nhân viên'), 'nv@example.com');
    await user.type(screen.getByLabelText('Tên hiển thị'), 'Nhân viên A');
    await user.type(screen.getByLabelText('Mật khẩu tạm'), 'Matkhau123');
    await user.click(screen.getByRole('button', { name: 'Tạo tài khoản' }));

    await waitFor(() => expect(create).toHaveBeenCalledOnce());
    await waitFor(() => expect(list).toHaveBeenCalledTimes(2));
  });

  it('keeps employee creation blocked until a staff access policy is approved', async () => {
    renderPage(createApi());

    expect(
      await screen.findByText(blockedCapability.message),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Thêm nhân viên' }),
    ).toBeDisabled();
  });

  it('opens employee creation under the Owner waiver and shows the Free-plan warning', async () => {
    const user = userEvent.setup();
    renderPage(
      createApi({
        getAccessCapability: vi.fn().mockResolvedValue(ownerWaiverCapability),
      }),
    );

    expect(
      await screen.findByText(ownerWaiverCapability.message),
    ).toBeInTheDocument();
    const createButton = screen.getByRole('button', {
      name: 'Thêm nhân viên',
    });
    expect(createButton).toBeEnabled();
    await user.click(createButton);
    expect(screen.getByText('Tạo tài khoản mới')).toBeInTheDocument();
  });

  it('locks owner-only permissions and can deactivate an employee with a reason', async () => {
    const user = userEvent.setup();
    const setActive = vi.fn().mockResolvedValue({
      authReactivationPending: false,
      authSessionRevocationPending: false,
    });
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

it('shows the inventory-only role with fixed access instead of editable grants', async () => {
  renderPage(
    createApi({
      list: vi.fn().mockResolvedValue({
        ...staffFeed,
        items: [{ ...staffFeed.items[0], roleTemplate: 'WAREHOUSE_VIEWER' }],
      }),
    }),
  );
  expect(
    await screen.findByRole('heading', { name: 'Nhân viên A' }),
  ).toBeVisible();
  expect(screen.getByRole('combobox', { name: 'Vai trò mới' })).toHaveValue(
    'WAREHOUSE_VIEWER',
  );
  await userEvent.click(screen.getByText('Phân quyền'));
  expect(
    screen.queryByRole('combobox', { name: 'Quản lý nhân viên' }),
  ).not.toBeInTheDocument();
  expect(screen.getByText('Không được cấp')).toBeVisible();
});

beforeEach(() => localStorage.clear());

async function enterStaff(user: ReturnType<typeof userEvent.setup>) {
  await user.click(
    await screen.findByRole('button', { name: 'Thêm nhân viên' }),
  );
  await user.type(screen.getByLabelText('Email nhân viên'), 'nv@example.com');
  await user.type(screen.getByLabelText('Tên hiển thị'), 'Nhân viên A');
  await user.type(screen.getByLabelText('Mật khẩu tạm'), 'Matkhau123');
  await user.click(screen.getByRole('button', { name: 'Tạo tài khoản' }));
}

it('resumes partial creation after reload with the same key and no persisted form or password', async () => {
  const user = userEvent.setup();
  const pendingUserId = '00000000-0000-4000-8000-000000000201';
  const create = vi
    .fn()
    .mockRejectedValueOnce(
      new StaffRecoveryError(
        'STAFF_FINALIZATION_PENDING',
        null,
        pendingUserId,
        true,
      ),
    )
    .mockRejectedValueOnce(
      new StaffRecoveryError(
        'STAFF_FINALIZATION_PENDING',
        null,
        pendingUserId,
        true,
      ),
    )
    .mockResolvedValueOnce(undefined);
  const list = vi.fn().mockResolvedValue(emptyFeed);
  const api = createApi({
    create,
    list,
    getAccessCapability: vi.fn().mockResolvedValue(ownerWaiverCapability),
  });
  const view = renderPage(api);
  await enterStaff(user);
  expect(
    await screen.findByText('Tài khoản đã tạo, cần hoàn tất hồ sơ.'),
  ).toBeVisible();
  const first = create.mock.calls[0]![0];
  expect(first.idempotencyKey).toEqual(expect.any(String));
  const stored = JSON.stringify(localStorage);
  expect(stored).toContain(first.idempotencyKey);
  expect(stored).not.toMatch(/Matkhau123|nv@example.com|Nhân viên A/);
  expect(screen.getByRole('button', { name: 'Thêm nhân viên' })).toBeDisabled();
  view.unmount();
  renderPage(api);
  await user.click(
    await screen.findByRole('button', { name: 'Tiếp tục hoàn tất hồ sơ' }),
  );
  expect(create).toHaveBeenLastCalledWith({
    idempotencyKey: first.idempotencyKey,
    pendingUserId,
  });
  await user.click(
    await screen.findByRole('button', { name: 'Tiếp tục hoàn tất hồ sơ' }),
  );
  expect(await screen.findByText('Đã tạo tài khoản nhân viên.')).toBeVisible();
  expect(create).toHaveBeenCalledTimes(3);
  expect(list.mock.invocationCallOrder[2]).toBeLessThan(
    create.mock.invocationCallOrder[1]!,
  );
  expect(JSON.stringify(localStorage)).not.toContain(first.idempotencyKey);
});

it('does not issue another create when the first response was lost before receiving a user ID', async () => {
  const user = userEvent.setup();
  const create = vi
    .fn()
    .mockRejectedValue(
      new StaffRecoveryError('STAFF_CREATE_OUTCOME_UNKNOWN', null, null, true),
    );
  renderPage(
    createApi({
      create,
      getAccessCapability: vi.fn().mockResolvedValue(ownerWaiverCapability),
    }),
  );
  await enterStaff(user);
  await user.click(
    await screen.findByRole('button', { name: 'Kiểm tra danh sách' }),
  );
  expect(create).toHaveBeenCalledTimes(1);
  expect(
    screen.queryByRole('button', { name: 'Tạo tài khoản' }),
  ).not.toBeInTheDocument();
  expect(screen.getByText(/Mã yêu cầu:/)).toBeVisible();
});

it('keeps editable creation fields after a definitive rejection so only the wrong field needs correction', async () => {
  const user = userEvent.setup();
  const create = vi
    .fn()
    .mockRejectedValueOnce(new StaffRecoveryError('DUPLICATE_STAFF_EMAIL'))
    .mockResolvedValueOnce(undefined);
  renderPage(
    createApi({
      create,
      getAccessCapability: vi.fn().mockResolvedValue(ownerWaiverCapability),
    }),
  );
  await user.click(
    await screen.findByRole('button', { name: 'Thêm nhân viên' }),
  );
  await user.type(
    screen.getByLabelText('Email nhân viên'),
    'exists@example.com',
  );
  await user.type(screen.getByLabelText('Tên hiển thị'), 'Nhân viên cần tạo');
  await user.selectOptions(
    screen.getByLabelText('Vai trò'),
    'WAREHOUSE_VIEWER',
  );
  await user.type(screen.getByLabelText('Mật khẩu tạm'), 'Matkhau123');
  await user.click(screen.getByRole('button', { name: 'Tạo tài khoản' }));
  await screen.findByText('Email này đã được dùng cho tài khoản khác.');
  expect(screen.getByLabelText('Email nhân viên')).toHaveValue(
    'exists@example.com',
  );
  expect(screen.getByLabelText('Tên hiển thị')).toHaveValue(
    'Nhân viên cần tạo',
  );
  expect(screen.getByLabelText('Vai trò')).toHaveValue('WAREHOUSE_VIEWER');
  await user.clear(screen.getByLabelText('Email nhân viên'));
  await user.type(screen.getByLabelText('Email nhân viên'), 'new@example.com');
  await user.click(screen.getByRole('button', { name: 'Tạo tài khoản' }));
  await screen.findByText('Đã tạo tài khoản nhân viên.');
  expect(create).toHaveBeenLastCalledWith(
    expect.objectContaining({
      email: 'new@example.com',
      displayName: 'Nhân viên cần tạo',
      roleTemplate: 'WAREHOUSE_VIEWER',
    }),
  );
});
