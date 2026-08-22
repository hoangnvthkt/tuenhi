import { authorizeOwner } from '../_shared/authorize-owner.ts';
import {
  failure,
  isCommandEnvelope,
  jsonResponse,
  preflightOrMethodError,
  readJson,
} from '../_shared/http.ts';
import { parseStaffActionInput } from '../_shared/staff-validation.ts';

Deno.serve(async (request) => {
  const earlyResponse = preflightOrMethodError(request);
  if (earlyResponse) return earlyResponse;
  const authorization = await authorizeOwner(request);
  if (!authorization.ok) return authorization.response;
  const body = await readJson(request);
  if (!body.ok) return body.response;
  const parsed = parseStaffActionInput(body.value);
  if (!parsed.ok) return failure(400, 'VALIDATION_ERROR', parsed.message);

  const { userId, reason, idempotencyKey } = parsed.value;
  const { data, error } = await authorization.userClient.rpc(
    'set_staff_active',
    {
      p_user_id: userId,
      p_active: true,
      p_reason: reason,
      p_idempotency_key: idempotencyKey,
    },
  );
  if (error || !isCommandEnvelope(data)) {
    return failure(
      500,
      'STAFF_UPDATE_FAILED',
      'Không thể mở lại tài khoản. Vui lòng thử lại.',
    );
  }
  if (data.ok !== true) return jsonResponse(data, 400);

  const { error: authError } =
    await authorization.adminClient.auth.admin.updateUserById(userId, {
      ban_duration: 'none',
    });
  if (authError) {
    return jsonResponse(
      {
        ...data,
        data: { ...(data.data as object), authReactivationPending: true },
      },
      200,
    );
  }
  return jsonResponse(data);
});
