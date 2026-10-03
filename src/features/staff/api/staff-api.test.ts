import { FunctionsHttpError } from '@supabase/supabase-js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getSupabaseClient } from '@/shared/supabase/client';
import { createStaffApi } from './staff-api';

vi.mock('@/shared/supabase/client', () => ({
  getSupabaseClient: vi.fn(),
}));

describe('createStaffApi', () => {
  beforeEach(() => {
    vi.mocked(getSupabaseClient).mockReset();
  });

  it('preserves a safe business error returned by create-employee', async () => {
    const response = new Response(
      JSON.stringify({
        ok: false,
        data: null,
        error: {
          code: 'PRODUCTION_AUTH_HARDENING_REQUIRED',
          message: 'server detail must not be rendered',
          details: {},
        },
        correlationId: '00000000-0000-4000-8000-000000000401',
      }),
      { status: 409, headers: { 'Content-Type': 'application/json' } },
    );
    vi.mocked(getSupabaseClient).mockReturnValue({
      functions: {
        invoke: vi.fn().mockResolvedValue({
          data: null,
          error: new FunctionsHttpError(response),
        }),
      },
    } as never);

    await expect(
      createStaffApi().create({
        email: 'nv@example.com',
        displayName: 'Nhân viên A',
        roleTemplate: 'SALES_WAREHOUSE',
        temporaryPassword: 'Matkhau123',
        idempotencyKey: '00000000-0000-4000-8000-000000000111',
      }),
    ).rejects.toThrow(
      'Chưa thể tạo nhân viên. Hãy hoàn tất bảo vệ mật khẩu trước khi mở tài khoản nhân viên.',
    );
  });

  it('reads the minimal staff access capability without lifecycle details', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: {
        ok: true,
        data: {
          canCreate: true,
          policy: 'OWNER_WAIVER',
          message:
            'Đang dùng ngoại lệ Owner: Supabase Free không kiểm tra mật khẩu đã bị rò rỉ.',
        },
        error: null,
        correlationId: '00000000-0000-4000-8000-000000000402',
      },
      error: null,
    });
    vi.mocked(getSupabaseClient).mockReturnValue({ rpc } as never);

    await expect(createStaffApi().getAccessCapability()).resolves.toEqual({
      canCreate: true,
      policy: 'OWNER_WAIVER',
      message:
        'Đang dùng ngoại lệ Owner: Supabase Free không kiểm tra mật khẩu đã bị rò rỉ.',
    });
    expect(rpc).toHaveBeenCalledWith('get_staff_access_capability');
  });
});

it('reads warehouse viewer accounts and their defaults from the staff feed', async () => {
  const viewer = {
    id: '00000000-0000-4000-8000-000000000010',
    email: 'kho@example.com',
    displayName: 'Kho',
    roleTemplate: 'WAREHOUSE_VIEWER',
    isActive: true,
    mustChangePassword: false,
    createdAt: '2026-10-02T00:00:00Z',
    overrides: [],
  };
  const permission = {
    code: 'inventory.read',
    category: 'Tồn kho',
    label: 'Xem tồn kho',
    description: 'Xem số lượng',
    ownerOnly: false,
    salesWarehouseDefault: true,
    businessDefault: true,
    warehouseViewerDefault: true,
  };
  vi.mocked(getSupabaseClient).mockReturnValue({
    rpc: vi.fn().mockResolvedValue({
      data: {
        ok: true,
        data: {
          items: [viewer],
          permissionDefinitions: [permission],
          nextCursor: null,
        },
        error: null,
        correlationId: '00000000-0000-4000-8000-000000000011',
      },
      error: null,
    }),
  } as never);
  expect(await createStaffApi().list()).toEqual({
    items: [viewer],
    permissionDefinitions: [permission],
    nextCursor: null,
  });
});

it('keeps recovery details and caller operation key through HTTP failure and resume', async () => {
  const idempotencyKey = '00000000-0000-4000-8000-000000000111';
  const pendingUserId = '00000000-0000-4000-8000-000000000112';
  const correlationId = '00000000-0000-4000-8000-000000000113';
  const envelope = {
    ok: false,
    data: null,
    error: {
      code: 'STAFF_FINALIZATION_PENDING',
      message: 'private server detail',
      details: { pendingUserId, outcomeUnknown: true },
    },
    correlationId,
  };
  const invoke = vi
    .fn()
    .mockResolvedValueOnce({
      data: null,
      error: new FunctionsHttpError(
        new Response(JSON.stringify(envelope), { status: 500 }),
      ),
    })
    .mockResolvedValueOnce({
      data: {
        ok: true,
        data: { userId: pendingUserId },
        error: null,
        correlationId,
      },
      error: null,
    });
  vi.mocked(getSupabaseClient).mockReturnValue({
    functions: { invoke },
  } as never);
  const api = createStaffApi();
  const initial = {
    email: 'nv@example.com',
    displayName: 'An',
    roleTemplate: 'BUSINESS' as const,
    temporaryPassword: 'Matkhau123',
    idempotencyKey,
  };
  await expect(api.create(initial)).rejects.toMatchObject({
    code: 'STAFF_FINALIZATION_PENDING',
    pendingUserId,
    correlationId,
    outcomeUnknown: true,
  });
  expect(invoke).toHaveBeenLastCalledWith('create-employee', { body: initial });
  await api.create({ pendingUserId, idempotencyKey });
  expect(invoke).toHaveBeenLastCalledWith('create-employee', {
    body: { pendingUserId, idempotencyKey },
  });
});

it('treats a lost create response as unknown without losing operation identity', async () => {
  vi.mocked(getSupabaseClient).mockReturnValue({
    functions: { invoke: vi.fn().mockRejectedValue(new TypeError('network')) },
  } as never);
  await expect(
    createStaffApi().create({
      pendingUserId: '00000000-0000-4000-8000-000000000112',
      idempotencyKey: '00000000-0000-4000-8000-000000000111',
    }),
  ).rejects.toMatchObject({ outcomeUnknown: true });
});

it('exposes partial Auth reactivation and preserves the caller key on retry', async () => {
  const input = {
    userId: '00000000-0000-4000-8000-000000000201',
    active: true,
    reason: 'Trở lại làm việc',
    idempotencyKey: '00000000-0000-4000-8000-000000000202',
  };
  const invoke = vi
    .fn()
    .mockResolvedValueOnce({
      data: {
        ok: true,
        data: {
          userId: input.userId,
          isActive: true,
          authReactivationPending: true,
        },
        error: null,
        correlationId: input.idempotencyKey,
      },
      error: null,
    })
    .mockResolvedValueOnce({
      data: {
        ok: true,
        data: { userId: input.userId, isActive: true },
        error: null,
        correlationId: input.idempotencyKey,
      },
      error: null,
    });
  vi.mocked(getSupabaseClient).mockReturnValue({
    functions: { invoke },
  } as never);
  const api = createStaffApi();
  await expect(api.setActive(input)).resolves.toEqual({
    authReactivationPending: true,
    authSessionRevocationPending: false,
  });
  await expect(api.setActive(input)).resolves.toEqual({
    authReactivationPending: false,
    authSessionRevocationPending: false,
  });
  expect(
    invoke.mock.calls.every(
      ([, options]) => options.body.idempotencyKey === input.idempotencyKey,
    ),
  ).toBe(true);
});

it('does not call an unrecognized Auth status a completed activation', async () => {
  const input = {
    userId: '00000000-0000-4000-8000-000000000201',
    active: true,
    reason: 'Trở lại',
    idempotencyKey: '00000000-0000-4000-8000-000000000202',
  };
  vi.mocked(getSupabaseClient).mockReturnValue({
    functions: {
      invoke: vi.fn().mockResolvedValue({
        data: {
          ok: true,
          data: {
            userId: input.userId,
            isActive: true,
            authReactivationPending: 'unknown',
          },
          error: null,
          correlationId: input.idempotencyKey,
        },
        error: null,
      }),
    },
  } as never);
  await expect(createStaffApi().setActive(input)).rejects.toMatchObject({
    outcomeUnknown: true,
  });
});
