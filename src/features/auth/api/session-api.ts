import { z } from 'zod';
import { getBusinessErrorMessage } from '@/shared/api/command-error';
import { getSupabaseClient } from '@/shared/supabase/client';
import type { SessionApi } from '../model/session-context';

const sessionContextSchema = z.object({
  userId: z.uuid(),
  email: z.email(),
  displayName: z.string().trim().min(1).max(120),
  roleTemplate: z.enum(['SALES_WAREHOUSE', 'BUSINESS', 'OWNER']),
  isActive: z.boolean(),
  mustChangePassword: z.boolean(),
  permissions: z.array(z.string().trim().min(1).max(100)),
});

const commandErrorSchema = z.object({
  code: z.string().trim().min(1).max(100),
  message: z.string().max(500),
  details: z.record(z.string(), z.unknown()),
});

const sessionEnvelopeSchema = z.discriminatedUnion('ok', [
  z.object({
    ok: z.literal(true),
    data: sessionContextSchema,
    error: z.null(),
    correlationId: z.uuid(),
  }),
  z.object({
    ok: z.literal(false),
    data: z.null(),
    error: commandErrorSchema,
    correlationId: z.uuid(),
  }),
]);

const passwordChangeEnvelopeSchema = z.discriminatedUnion('ok', [
  z.object({
    ok: z.literal(true),
    data: z.object({
      userId: z.uuid(),
      mustChangePassword: z.literal(false),
    }),
    error: z.null(),
    correlationId: z.uuid(),
  }),
  z.object({
    ok: z.literal(false),
    data: z.null(),
    error: commandErrorSchema,
    correlationId: z.uuid(),
  }),
]);

function safeFailure(message: string) {
  return new Error(message);
}

export function createSessionApi(): SessionApi {
  const client = getSupabaseClient();

  return {
    async getAuthSession() {
      const { data, error } = await client.auth.getSession();
      if (error) {
        throw safeFailure(
          'Không thể kiểm tra phiên đăng nhập. Vui lòng thử lại.',
        );
      }

      return data.session ? { userId: data.session.user.id } : null;
    },

    async getSessionContext() {
      const { data, error } = await client.rpc('get_my_session_context');
      if (error) {
        throw safeFailure(
          'Không thể tải thông tin tài khoản. Vui lòng thử lại.',
        );
      }

      const parsed = sessionEnvelopeSchema.safeParse(data);
      if (!parsed.success) {
        throw safeFailure(
          'Phản hồi phiên đăng nhập không hợp lệ. Vui lòng đăng nhập lại.',
        );
      }

      if (!parsed.data.ok) {
        throw safeFailure(getBusinessErrorMessage(parsed.data.error.code));
      }

      return parsed.data.data;
    },

    async signIn(email, password) {
      const { error } = await client.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      });

      if (error) {
        throw safeFailure('Email hoặc mật khẩu không đúng.');
      }
    },

    async changePassword(password, isInitialPasswordChange) {
      if (!isInitialPasswordChange) {
        const { error } = await client.auth.updateUser({ password });
        if (error) {
          throw safeFailure('Không thể đổi mật khẩu. Vui lòng thử lại.');
        }
        return;
      }

      const { data, error } = await client.functions.invoke(
        'change-initial-password',
        { body: { password } },
      );

      if (error) {
        throw safeFailure('Không thể đổi mật khẩu. Vui lòng thử lại.');
      }

      const parsed = passwordChangeEnvelopeSchema.safeParse(data);
      if (!parsed.success) {
        throw safeFailure('Không thể xác nhận mật khẩu mới. Vui lòng thử lại.');
      }

      if (!parsed.data.ok) {
        throw safeFailure(getBusinessErrorMessage(parsed.data.error.code));
      }
    },

    async signOut() {
      const { error } = await client.auth.signOut();
      if (error) {
        throw safeFailure('Không thể đăng xuất. Vui lòng thử lại.');
      }
    },

    subscribe(listener) {
      const { data } = client.auth.onAuthStateChange(() => {
        listener();
      });

      return () => data.subscription.unsubscribe();
    },
  };
}
