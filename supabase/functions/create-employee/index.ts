import { authorizeOwner } from '../_shared/authorize-owner.ts';
import {
  failure,
  isCommandEnvelope,
  jsonResponse,
  preflightOrMethodError,
  readJson,
} from '../_shared/http.ts';
import { parseCreateEmployeeInput } from '../_shared/staff-validation.ts';

Deno.serve(async (request) => {
  const earlyResponse = preflightOrMethodError(request);
  if (earlyResponse) return earlyResponse;

  const authorization = await authorizeOwner(request);
  if (!authorization.ok) return authorization.response;

  const body = await readJson(request);
  if (!body.ok) return body.response;
  const parsed = parseCreateEmployeeInput(body.value);
  if (!parsed.ok) return failure(400, 'VALIDATION_ERROR', parsed.message);

  const input = parsed.value;
  const { data: lifecycle, error: lifecycleError } =
    await authorization.adminClient.rpc('get_project_lifecycle');
  if (
    lifecycleError ||
    !isCommandEnvelope(lifecycle) ||
    lifecycle.ok !== true ||
    typeof lifecycle.data !== 'object' ||
    lifecycle.data === null
  ) {
    return failure(
      503,
      'PROJECT_LIFECYCLE_UNAVAILABLE',
      'Không thể kiểm tra trạng thái môi trường. Vui lòng thử lại.',
    );
  }
  const lifecycleData = lifecycle.data as Record<string, unknown>;
  if (
    lifecycleData.mode === 'OWNER_PILOT' &&
    lifecycleData.authHardeningCompletedAt === null
  ) {
    return failure(
      409,
      'PRODUCTION_AUTH_HARDENING_REQUIRED',
      'Pilot chỉ cho phép chủ cửa hàng sử dụng. Hãy bật bảo vệ mật khẩu bị rò rỉ trước khi tạo nhân viên.',
    );
  }

  let userId = input.pendingUserId;
  try {
    if (userId) {
      const { data, error } =
        await authorization.adminClient.auth.admin.getUserById(userId);
      if (error || data.user.email?.toLowerCase() !== input.email) {
        return failure(
          409,
          'INVALID_STATE',
          'Tài khoản chờ hoàn tất không còn hợp lệ.',
        );
      }
    } else {
      const { data, error } =
        await authorization.adminClient.auth.admin.createUser({
          email: input.email,
          password: input.temporaryPassword,
          email_confirm: true,
        });
      if (error || !data.user) {
        return failure(
          409,
          'STAFF_AUTH_CREATE_FAILED',
          'Không thể tạo tài khoản. Email có thể đã được sử dụng.',
        );
      }
      userId = data.user.id;
    }

    const { data: finalization, error: finalizationError } =
      await authorization.adminClient.rpc('finalize_staff_profile', {
        p_user_id: userId,
        p_email: input.email,
        p_display_name: input.displayName,
        p_role_template: input.roleTemplate,
        p_created_by: authorization.actorId,
        p_idempotency_key: input.idempotencyKey,
      });

    if (finalizationError || !isCommandEnvelope(finalization)) {
      return jsonResponse(
        {
          ok: false,
          data: null,
          error: {
            code: 'STAFF_FINALIZATION_PENDING',
            message:
              'Tài khoản Auth đã được tạo nhưng hồ sơ chưa hoàn tất. Vui lòng thử lại.',
            details: { pendingUserId: userId, outcomeUnknown: true },
          },
          correlationId: crypto.randomUUID(),
        },
        500,
      );
    }

    return jsonResponse(finalization, finalization.ok === true ? 200 : 400);
  } catch {
    return jsonResponse(
      {
        ok: false,
        data: null,
        error: {
          code: 'STAFF_CREATE_OUTCOME_UNKNOWN',
          message:
            'Chưa xác định được kết quả tạo tài khoản. Vui lòng kiểm tra danh sách nhân viên.',
          details: { pendingUserId: userId ?? null, outcomeUnknown: true },
        },
        correlationId: crypto.randomUUID(),
      },
      500,
    );
  }
});
