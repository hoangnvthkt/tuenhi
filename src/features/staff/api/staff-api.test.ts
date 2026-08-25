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
