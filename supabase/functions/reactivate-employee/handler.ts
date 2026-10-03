import {
  failure,
  isCommandEnvelope,
  jsonResponse,
  preflightOrMethodError,
  readJson,
} from '../_shared/http.ts';
import { parseStaffActionInput } from '../_shared/staff-validation.ts';
type Authorization =
  | { ok: false; response: Response }
  | {
      ok: true;
      userClient: {
        rpc(
          name: string,
          args: Record<string, unknown>,
        ): PromiseLike<{ data: unknown; error: unknown }>;
      };
      adminClient: {
        auth: {
          admin: {
            updateUserById(
              id: string,
              attrs: { ban_duration: string },
            ): PromiseLike<{ error: unknown }>;
          };
        };
      };
    };
export function reactivateEmployeeHandler(
  authorize: (request: Request) => Promise<Authorization>,
) {
  return async (request: Request) => {
    const early = preflightOrMethodError(request);
    if (early) return early;
    const authorization = await authorize(request);
    if (!authorization.ok) return authorization.response;
    const body = await readJson(request);
    if (!body.ok) return body.response;
    const value =
      typeof body.value === 'object' && body.value !== null
        ? (body.value as Record<string, unknown>)
        : {};
    const resume = value.resume === true;
    const parsed = parseStaffActionInput(
      resume ? { ...value, reason: 'Tiếp tục yêu cầu đã ghi nhận' } : value,
    );
    if (!parsed.ok) return failure(400, 'VALIDATION_ERROR', parsed.message);
    const { userId, reason, idempotencyKey } = parsed.value;
    try {
      if (!resume) {
        const { data, error } = await authorization.userClient.rpc(
          'set_staff_active',
          {
            p_user_id: userId,
            p_active: true,
            p_reason: reason,
            p_idempotency_key: idempotencyKey,
          },
        );
        if (error || !isCommandEnvelope(data))
          throw new Error('Unknown profile outcome');
        if (data.ok !== true) return jsonResponse(data, 400);
        if (
          !data.data ||
          (data.data as Record<string, unknown>).userId !== userId ||
          (data.data as Record<string, unknown>).isActive !== true
        ) {
          return failure(
            409,
            'STAFF_RECOVERY_STALE',
            'Yêu cầu không khớp tài khoản cần mở lại.',
          );
        }
      }
      const { data: status, error } = await authorization.userClient.rpc(
        'get_staff_reactivation_recovery',
        { p_user_id: userId, p_idempotency_key: idempotencyKey },
      );
      if (error || !isCommandEnvelope(status))
        throw new Error('Unknown recovery state');
      if (status.ok !== true) return jsonResponse(status, 400);
      const current = status.data as Record<string, unknown> | null;
      if (
        current?.userId !== userId ||
        current.isActive !== true ||
        current.operationFound !== true
      ) {
        return failure(
          409,
          'STAFF_RECOVERY_STALE',
          'Tài khoản đã thay đổi. Vui lòng kiểm tra lại.',
        );
      }
      let pending = false;
      try {
        const result =
          await authorization.adminClient.auth.admin.updateUserById(userId, {
            ban_duration: 'none',
          });
        pending = !!result.error;
      } catch {
        pending = true;
      }
      return jsonResponse({
        ...status,
        data: { userId, isActive: true, authReactivationPending: pending },
      });
    } catch {
      return jsonResponse(
        {
          ok: false,
          data: null,
          error: {
            code: 'STAFF_UPDATE_OUTCOME_UNKNOWN',
            message: 'Chưa xác định được kết quả cập nhật tài khoản.',
            details: { outcomeUnknown: true },
          },
          correlationId: crypto.randomUUID(),
        },
        500,
      );
    }
  };
}
