import { describe, expect, it, vi } from 'vitest';
import { createPasswordResetApi } from './password-reset-api';

const mocks = vi.hoisted(() => ({
  resetPasswordForEmail: vi.fn(),
}));

vi.mock('@/shared/supabase/client', () => ({
  getSupabaseClient: () => ({
    auth: {
      resetPasswordForEmail: mocks.resetPasswordForEmail,
    },
  }),
}));

describe('PasswordResetApi', () => {
  it('sends a normalized email to the same-site password-change route', async () => {
    mocks.resetPasswordForEmail.mockResolvedValue({ data: {}, error: null });

    await createPasswordResetApi('https://preview.example.vercel.app').request(
      ' Owner@Example.com ',
    );

    expect(mocks.resetPasswordForEmail).toHaveBeenCalledWith(
      'owner@example.com',
      { redirectTo: 'https://preview.example.vercel.app/change-password' },
    );
  });
});
