import { FunctionsHttpError } from '@supabase/supabase-js';
import { z } from 'zod';
import { getBusinessErrorMessage } from '../../lib/errors/command-error';
import { getSupabaseClient } from '../../lib/supabase/client';

const overrideSchema = z.object({
  permissionCode: z.string().min(1),
  effect: z.enum(['GRANT', 'REVOKE']),
});

const staffMemberSchema = z.object({
  id: z.uuid(),
  email: z.email(),
  displayName: z.string().min(1).max(120),
  roleTemplate: z.enum(['SALES_WAREHOUSE', 'BUSINESS', 'OWNER']),
  isActive: z.boolean(),
  mustChangePassword: z.boolean(),
  createdAt: z.iso.datetime({ offset: true }),
  overrides: z.array(overrideSchema),
});

const permissionDefinitionSchema = z.object({
  code: z.string().min(1),
  category: z.string().min(1),
  label: z.string().min(1),
  description: z.string().min(1),
  ownerOnly: z.boolean(),
  salesWarehouseDefault: z.boolean(),
  businessDefault: z.boolean(),
});

const staffFeedSchema = z.object({
  items: z.array(staffMemberSchema),
  permissionDefinitions: z.array(permissionDefinitionSchema),
  nextCursor: z
    .object({ createdAt: z.iso.datetime({ offset: true }), id: z.uuid() })
    .nullable(),
});

const commandErrorSchema = z.object({
  code: z.string().min(1).max(100),
  message: z.string().max(500),
  details: z.record(z.string(), z.unknown()),
});

function envelopeSchema<T extends z.ZodType>(data: T) {
  return z.discriminatedUnion('ok', [
    z.object({
      ok: z.literal(true),
      data,
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
}

const feedEnvelopeSchema = envelopeSchema(staffFeedSchema);
const mutationEnvelopeSchema = envelopeSchema(
  z.record(z.string(), z.unknown()),
);

export type StaffMember = z.infer<typeof staffMemberSchema>;
export type PermissionDefinition = z.infer<typeof permissionDefinitionSchema>;
export type StaffFeed = z.infer<typeof staffFeedSchema>;
export type EmployeeRole = 'SALES_WAREHOUSE' | 'BUSINESS';
export type PermissionEffect = 'DEFAULT' | 'GRANT' | 'REVOKE';

export type CreateStaffInput = {
  email: string;
  displayName: string;
  roleTemplate: EmployeeRole;
  temporaryPassword: string;
};

export interface StaffApi {
  list(): Promise<StaffFeed>;
  create(input: CreateStaffInput): Promise<void>;
  setActive(input: {
    userId: string;
    active: boolean;
    reason: string;
  }): Promise<void>;
  setRole(input: {
    userId: string;
    role: EmployeeRole;
    reason: string;
  }): Promise<void>;
  setPermissionOverride(input: {
    userId: string;
    permissionCode: string;
    effect: PermissionEffect;
    reason: string;
  }): Promise<void>;
  resetPassword(input: {
    userId: string;
    temporaryPassword: string;
    reason: string;
  }): Promise<void>;
}

function safeCommandFailure(code?: string) {
  return new Error(
    code
      ? getBusinessErrorMessage(code)
      : 'Không thể hoàn tất thao tác. Vui lòng thử lại.',
  );
}

function assertMutation(data: unknown) {
  const parsed = mutationEnvelopeSchema.safeParse(data);
  if (!parsed.success) throw safeCommandFailure();
  if (!parsed.data.ok) throw safeCommandFailure(parsed.data.error.code);
}

async function safeFunctionFailure(error: unknown) {
  if (
    error instanceof FunctionsHttpError &&
    error.context instanceof Response
  ) {
    try {
      const data = await error.context.clone().json();
      const parsed = mutationEnvelopeSchema.safeParse(data);
      if (parsed.success && !parsed.data.ok) {
        return safeCommandFailure(parsed.data.error.code);
      }
    } catch {
      // Fall through to the generic safe message.
    }
  }
  return safeCommandFailure();
}

export function createStaffApi(): StaffApi {
  const client = getSupabaseClient();

  return {
    async list() {
      const { data, error } = await client.rpc('list_staff', { p_limit: 50 });
      if (error) throw safeCommandFailure();
      const parsed = feedEnvelopeSchema.safeParse(data);
      if (!parsed.success) throw safeCommandFailure();
      if (!parsed.data.ok) throw safeCommandFailure(parsed.data.error.code);
      return parsed.data.data;
    },

    async create(input) {
      const { data, error } = await client.functions.invoke('create-employee', {
        body: { ...input, idempotencyKey: crypto.randomUUID() },
      });
      if (error) throw await safeFunctionFailure(error);
      assertMutation(data);
    },

    async setActive({ userId, active, reason }) {
      const { data, error } = await client.functions.invoke(
        active ? 'reactivate-employee' : 'deactivate-employee',
        {
          body: { userId, reason, idempotencyKey: crypto.randomUUID() },
        },
      );
      if (error) throw safeCommandFailure();
      assertMutation(data);
    },

    async setRole({ userId, role, reason }) {
      const { data, error } = await client.rpc('set_staff_role', {
        p_user_id: userId,
        p_role: role,
        p_reason: reason,
        p_idempotency_key: crypto.randomUUID(),
      });
      if (error) throw safeCommandFailure();
      assertMutation(data);
    },

    async setPermissionOverride({ userId, permissionCode, effect, reason }) {
      const { data, error } = await client.rpc(
        'set_staff_permission_override',
        {
          p_user_id: userId,
          p_permission_code: permissionCode,
          p_effect: effect,
          p_reason: reason,
          p_idempotency_key: crypto.randomUUID(),
        },
      );
      if (error) throw safeCommandFailure();
      assertMutation(data);
    },

    async resetPassword({ userId, temporaryPassword, reason }) {
      const { data, error } = await client.functions.invoke(
        'reset-employee-password',
        {
          body: {
            userId,
            temporaryPassword,
            reason,
            idempotencyKey: crypto.randomUUID(),
          },
        },
      );
      if (error) throw safeCommandFailure();
      assertMutation(data);
    },
  };
}
