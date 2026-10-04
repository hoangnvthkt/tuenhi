import {
  failure,
  isCommandEnvelope,
  jsonResponse,
  preflightOrMethodError,
  readJson,
} from '../_shared/http.ts';
import {
  parseCreateEmployeeInput,
  type EmployeeRole,
} from '../_shared/staff-validation.ts';
import { canCreateStaff } from '../_shared/staff-access-policy.ts';

type AuthUser = {
  id: string;
  email?: string;
  app_metadata?: Record<string, unknown>;
};
type AdminClient = {
  rpc(
    name: string,
    args?: Record<string, unknown>,
  ): PromiseLike<{ data: unknown; error: unknown }>;
  auth: {
    admin: {
      createUser(input: {
        email: string;
        password: string;
        email_confirm: boolean;
        app_metadata: Record<string, unknown>;
      }): PromiseLike<{
        data: { user: AuthUser | null };
        error: { status?: number; code?: string } | null;
      }>;
      getUserById(
        id: string,
      ): PromiseLike<{ data: { user: AuthUser | null }; error: unknown }>;
    };
  };
};
type Authorization =
  | { ok: false; response: Response }
  | { ok: true; actorId: string; adminClient: AdminClient };
type Creation = {
  actorId: string;
  idempotencyKey: string;
  email: string;
  displayName: string;
  roleTemplate: EmployeeRole;
};

function pending(userId: string | undefined, correlationId?: string) {
  return jsonResponse(
    {
      ok: false,
      data: null,
      error: {
        code: userId
          ? 'STAFF_FINALIZATION_PENDING'
          : 'STAFF_CREATE_OUTCOME_UNKNOWN',
        message: userId
          ? 'Tài khoản đã tạo, cần hoàn tất hồ sơ.'
          : 'Chưa xác định được kết quả tạo tài khoản.',
        details: { pendingUserId: userId ?? null, outcomeUnknown: true },
      },
      correlationId: correlationId ?? crypto.randomUUID(),
    },
    500,
  );
}

export function createEmployeeHandler(
  authorize: (request: Request) => Promise<Authorization>,
) {
  return async (request: Request): Promise<Response> => {
    const early = preflightOrMethodError(request);
    if (early) return early;
    const authorization = await authorize(request);
    if (!authorization.ok) return authorization.response;
    const body = await readJson(request);
    if (!body.ok) return body.response;
    const parsed = parseCreateEmployeeInput(body.value);
    if (!parsed.ok) return failure(400, 'VALIDATION_ERROR', parsed.message);
    const input = parsed.value;
    const { adminClient, actorId } = authorization;
    const { data: lifecycle, error: lifecycleError } = await adminClient.rpc(
      'get_project_lifecycle',
    );
    if (
      lifecycleError ||
      !isCommandEnvelope(lifecycle) ||
      lifecycle.ok !== true ||
      !lifecycle.data ||
      typeof lifecycle.data !== 'object'
    ) {
      return failure(
        503,
        'PROJECT_LIFECYCLE_UNAVAILABLE',
        'Không thể kiểm tra trạng thái môi trường. Vui lòng thử lại.',
      );
    }
    if (
      !canCreateStaff(
        (lifecycle.data as Record<string, unknown>).staffAccessPolicy,
      )
    ) {
      return failure(
        409,
        'STAFF_ACCESS_POLICY_REQUIRED',
        'Chưa được phê duyệt tạo tài khoản nhân viên.',
      );
    }
    let userId = input.pendingUserId;
    try {
      let creation: Creation;
      if (input.pendingUserId !== undefined) {
        const { data, error } = await adminClient.auth.admin.getUserById(
          input.pendingUserId,
        );
        if (error) return pending(userId);
        const value = data.user?.app_metadata
          ?.staffCreation as Partial<Creation> | null;
        if (
          !data.user ||
          data.user.id !== userId ||
          !value ||
          value.actorId !== actorId ||
          value.idempotencyKey !== input.idempotencyKey ||
          value.email !== data.user.email?.toLowerCase() ||
          typeof value.displayName !== 'string' ||
          value.displayName.length < 1 ||
          value.displayName.length > 120 ||
          !['BUSINESS', 'SALES_WAREHOUSE', 'WAREHOUSE_VIEWER'].includes(
            value.roleTemplate ?? '',
          )
        ) {
          return failure(
            409,
            'INVALID_STATE',
            'Tài khoản chờ hoàn tất không khớp yêu cầu ban đầu.',
          );
        }
        creation = value as Creation;
      } else {
        creation = {
          actorId,
          idempotencyKey: input.idempotencyKey,
          email: input.email,
          displayName: input.displayName,
          roleTemplate: input.roleTemplate,
        };
        const { data, error } = await adminClient.auth.admin.createUser({
          email: input.email,
          password: input.temporaryPassword,
          email_confirm: true,
          app_metadata: { staffCreation: creation },
        });
        if (error || !data.user) {
          if (
            error?.code === 'email_exists' ||
            error?.code === 'email_address_not_authorized'
          ) {
            return failure(
              409,
              error.code === 'email_exists'
                ? 'DUPLICATE_STAFF_EMAIL'
                : 'STAFF_AUTH_CREATE_FAILED',
              'Không thể tạo tài khoản với email này.',
            );
          }
          if (
            error?.status &&
            error.status >= 400 &&
            error.status < 500 &&
            error.status !== 408 &&
            error.status !== 429
          ) {
            return failure(
              409,
              'STAFF_AUTH_CREATE_FAILED',
              'Không thể tạo tài khoản. Vui lòng kiểm tra thông tin.',
            );
          }
          return pending(undefined);
        }
        userId = data.user.id;
      }
      const { data: finalization, error } = await adminClient.rpc(
        'finalize_staff_profile',
        {
          p_user_id: userId,
          p_email: creation.email,
          p_display_name: creation.displayName,
          p_role_template: creation.roleTemplate,
          p_created_by: actorId,
          p_idempotency_key: input.idempotencyKey,
        },
      );
      if (
        error ||
        !isCommandEnvelope(finalization) ||
        finalization.ok !== true
      ) {
        return pending(
          userId,
          isCommandEnvelope(finalization)
            ? String(finalization.correlationId)
            : undefined,
        );
      }
      return jsonResponse(finalization);
    } catch {
      return pending(userId);
    }
  };
}
