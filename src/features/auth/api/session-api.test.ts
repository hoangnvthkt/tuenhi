import { describe, expect, it, vi } from 'vitest';
import { createSessionApi } from './session-api';

const mocks = vi.hoisted(() => ({
  updateUser: vi.fn(),
  invoke: vi.fn(),
}));

vi.mock('@/shared/supabase/client', () => ({
  getSupabaseClient: () => ({
    auth: {
      updateUser: mocks.updateUser,
    },
    functions: {
      invoke: mocks.invoke,
    },
  }),
}));

describe('SessionApi.changePassword', () => {
  it('updates the current password directly after the initial-password requirement is complete', async () => {
    mocks.updateUser.mockResolvedValue({ data: { user: {} }, error: null });
    mocks.invoke.mockResolvedValue({
      data: {
        ok: true,
        data: {
          userId: '00000000-0000-4000-8000-000000000001',
          mustChangePassword: false,
        },
        error: null,
        correlationId: '00000000-0000-4000-8000-000000000002',
      },
      error: null,
    });

    await createSessionApi().changePassword('MatkhauMoi1', false);

    expect(mocks.updateUser).toHaveBeenCalledWith({ password: 'MatkhauMoi1' });
    expect(mocks.invoke).not.toHaveBeenCalled();
  });
});
