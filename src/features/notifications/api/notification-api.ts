import { z } from 'zod';
import { getBusinessErrorMessage } from '@/shared/api/command-error';
import { getSupabaseClient } from '@/shared/supabase/client';

const notificationSchema = z.object({
  id: z.uuid(),
  severity: z.enum(['INFO', 'SUCCESS', 'WARNING', 'ERROR']),
  category: z.string().trim().min(1).max(80),
  title: z.string().trim().min(1).max(160),
  message: z.string().trim().min(1).max(1000),
  actionRoute: z.string().startsWith('/').max(300).nullable(),
  entityType: z.string().trim().min(1).max(80).nullable(),
  entityId: z.uuid().nullable(),
  correlationId: z.uuid(),
  readAt: z.iso.datetime({ offset: true }).nullable(),
  createdAt: z.iso.datetime({ offset: true }),
});

const feedSchema = z.object({
  items: z.array(notificationSchema),
  unreadCount: z.number().int().nonnegative(),
  nextCursor: z
    .object({
      createdAt: z.iso.datetime({ offset: true }),
      id: z.uuid(),
    })
    .nullable(),
});

const commandErrorSchema = z.object({
  code: z.string().trim().min(1).max(100),
  message: z.string().max(500),
  details: z.record(z.string(), z.unknown()),
});

const feedEnvelopeSchema = z.discriminatedUnion('ok', [
  z.object({
    ok: z.literal(true),
    data: feedSchema,
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

const mutationEnvelopeSchema = z.discriminatedUnion('ok', [
  z.object({
    ok: z.literal(true),
    data: z.record(z.string(), z.unknown()),
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

export type UserNotification = z.infer<typeof notificationSchema>;
export type NotificationFeed = z.infer<typeof feedSchema>;

export interface NotificationApi {
  list(input?: {
    unreadOnly?: boolean;
    cursor?: { createdAt: string; id: string };
  }): Promise<NotificationFeed>;
  markRead(id: string): Promise<void>;
  markAllRead(): Promise<void>;
  subscribe(listener: () => void): () => void;
}

function safeRpcFailure(code?: string) {
  return new Error(
    code
      ? getBusinessErrorMessage(code)
      : 'Không thể hoàn tất thao tác. Vui lòng thử lại.',
  );
}

function assertMutationEnvelope(data: unknown) {
  const parsed = mutationEnvelopeSchema.safeParse(data);
  if (!parsed.success) throw safeRpcFailure();
  if (!parsed.data.ok) throw safeRpcFailure(parsed.data.error.code);
}

export function createNotificationApi(): NotificationApi {
  const client = getSupabaseClient();

  return {
    async list(input = {}) {
      const { data, error } = await client.rpc('get_my_notifications', {
        p_unread_only: input.unreadOnly ?? false,
        p_cursor_created_at: input.cursor?.createdAt,
        p_cursor_id: input.cursor?.id,
        p_limit: 50,
      });
      if (error) throw safeRpcFailure();

      const parsed = feedEnvelopeSchema.safeParse(data);
      if (!parsed.success) throw safeRpcFailure();
      if (!parsed.data.ok) throw safeRpcFailure(parsed.data.error.code);
      return parsed.data.data;
    },

    async markRead(id) {
      const { data, error } = await client.rpc('mark_notification_read', {
        p_notification_id: id,
      });
      if (error) throw safeRpcFailure();
      assertMutationEnvelope(data);
    },

    async markAllRead() {
      const { data, error } = await client.rpc('mark_all_notifications_read');
      if (error) throw safeRpcFailure();
      assertMutationEnvelope(data);
    },

    subscribe(listener) {
      const channel = client
        .channel('user-notifications')
        .on(
          'postgres_changes',
          { event: '*', schema: 'api', table: 'user_notifications' },
          () => listener(),
        )
        .subscribe();

      return () => {
        void client.removeChannel(channel);
      };
    },
  };
}
