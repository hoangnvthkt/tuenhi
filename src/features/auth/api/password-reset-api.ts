import { getSupabaseClient } from '@/shared/supabase/client';

export interface PasswordResetApi {
  request(email: string): Promise<void>;
}

export function createPasswordResetApi(
  origin = window.location.origin,
): PasswordResetApi {
  const client = getSupabaseClient();
  const redirectTo = new URL('/change-password', origin).toString();

  return {
    async request(email) {
      const { error } = await client.auth.resetPasswordForEmail(
        email.trim().toLowerCase(),
        { redirectTo },
      );
      if (error) {
        throw new Error('Không thể gửi yêu cầu đặt lại mật khẩu.');
      }
    },
  };
}
