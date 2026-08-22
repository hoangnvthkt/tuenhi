import { authorizeOwner } from '../_shared/authorize-owner.ts';
import {
  failure,
  isCommandEnvelope,
  jsonResponse,
  preflightOrMethodError,
  readJson,
} from '../_shared/http.ts';
import { parseResetPasswordInput } from '../_shared/staff-validation.ts';

Deno.serve(async (request) => {
  const earlyResponse = preflightOrMethodError(request);
  if (earlyResponse) return earlyResponse;
  const authorization = await authorizeOwner(request);
  if (!authorization.ok) return authorization.response;
  const body = await readJson(request);
  if (!body.ok) return body.response;
  const parsed = parseResetPasswordInput(body.value);
  if (!parsed.ok) return failure(400, 'VALIDATION_ERROR', parsed.message);

  const { userId, reason, temporaryPassword, idempotencyKey } = parsed.value;
  const { data, error } = await authorization.userClient.rpc(
    'prepare_staff_password_reset',
    {
      p_user_id: userId,
      p_reason: reason,
      p_idempotency_key: idempotencyKey,
    },
  );
  if (error || !isCommandEnvelope(data)) {
    return failure(
      500,
      'PASSWORD_RESET_FAILED',
      'Không thể chuẩn bị đặt lại mật khẩu. Vui lòng thử lại.',
    );
  }
  if (data.ok !== true) return jsonResponse(data, 400);

  const { error: authError } =
    await authorization.adminClient.auth.admin.updateUserById(userId, {
      password: temporaryPassword,
      ban_duration: 'none',
    });
  if (authError) {
    return jsonResponse(
      {
        ok: false,
        data: null,
        error: {
          code: 'PASSWORD_RESET_OUTCOME_UNKNOWN',
          message:
            'Tài khoản đã được yêu cầu đổi mật khẩu nhưng chưa xác nhận được mật khẩu tạm. Vui lòng thử lại.',
          details: { outcomeUnknown: true },
        },
        correlationId: data.correlationId,
      },
      500,
    );
  }
  return jsonResponse(data);
});
