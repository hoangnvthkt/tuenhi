import { createClient } from 'npm:@supabase/supabase-js@2.112.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const jsonHeaders = {
  ...corsHeaders,
  'Content-Type': 'application/json; charset=utf-8',
};

type CommandEnvelope = {
  ok: boolean;
  data: unknown;
  error: null | {
    code: string;
    message: string;
    details: Record<string, never>;
  };
  correlationId: string;
};

function failure(
  status: number,
  code: string,
  message: string,
  correlationId = crypto.randomUUID(),
) {
  return new Response(
    JSON.stringify({
      ok: false,
      data: null,
      error: { code, message, details: {} },
      correlationId,
    } satisfies CommandEnvelope),
    { status, headers: jsonHeaders },
  );
}

function requiredEnvironment(name: string) {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing runtime environment: ${name}`);
  return value;
}

function isPasswordValid(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length <= 128 &&
    /^(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9])[\s\S]{10,}$/.test(value)
  );
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (request.method !== 'POST') {
    return failure(
      405,
      'METHOD_NOT_ALLOWED',
      'Phương thức yêu cầu không hợp lệ.',
    );
  }

  const authorization = request.headers.get('Authorization');
  if (!authorization?.startsWith('Bearer ')) {
    return failure(401, 'AUTH_REQUIRED', 'Vui lòng đăng nhập để tiếp tục.');
  }

  let password: unknown;
  try {
    const body: unknown = await request.json();
    password =
      typeof body === 'object' && body !== null && 'password' in body
        ? body.password
        : undefined;
  } catch {
    return failure(400, 'VALIDATION_ERROR', 'Dữ liệu gửi lên chưa hợp lệ.');
  }

  if (!isPasswordValid(password)) {
    return failure(
      400,
      'VALIDATION_ERROR',
      'Mật khẩu phải có từ 10 đến 128 ký tự, gồm chữ thường, chữ hoa và số.',
    );
  }

  try {
    const supabaseUrl = requiredEnvironment('SUPABASE_URL');
    const anonKey = requiredEnvironment('SUPABASE_ANON_KEY');
    const serviceRoleKey = requiredEnvironment('SUPABASE_SERVICE_ROLE_KEY');

    const userClient = createClient(supabaseUrl, anonKey, {
      db: { schema: 'api' },
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const {
      data: { user },
      error: userError,
    } = await userClient.auth.getUser();

    if (userError || !user) {
      return failure(401, 'AUTH_REQUIRED', 'Phiên đăng nhập không còn hợp lệ.');
    }

    const { data: rawSession, error: sessionError } = await userClient.rpc(
      'get_my_session_context',
    );
    if (sessionError || typeof rawSession !== 'object' || rawSession === null) {
      return failure(
        403,
        'AUTH_REQUIRED',
        'Tài khoản chưa được cấp hồ sơ truy cập.',
      );
    }

    const sessionEnvelope = rawSession as Record<string, unknown>;
    const sessionData = sessionEnvelope.data as Record<string, unknown> | null;
    if (sessionEnvelope.ok !== true || !sessionData) {
      const error = sessionEnvelope.error as Record<string, unknown> | null;
      const code =
        error?.code === 'ACCOUNT_INACTIVE'
          ? 'ACCOUNT_INACTIVE'
          : 'AUTH_REQUIRED';
      const message =
        code === 'ACCOUNT_INACTIVE'
          ? 'Tài khoản đã bị khóa.'
          : 'Tài khoản chưa được cấp hồ sơ truy cập.';
      return failure(403, code, message);
    }

    if (sessionData.userId !== user.id) {
      return failure(403, 'AUTH_REQUIRED', 'Phiên đăng nhập không còn hợp lệ.');
    }

    if (sessionData.mustChangePassword !== true) {
      return failure(
        409,
        'INVALID_STATE',
        'Tài khoản không ở trạng thái cần đổi mật khẩu lần đầu.',
      );
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      db: { schema: 'api' },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { error: passwordError } =
      await adminClient.auth.admin.updateUserById(user.id, { password });
    if (passwordError) {
      return failure(
        500,
        'AUTH_UPDATE_FAILED',
        'Không thể đổi mật khẩu. Vui lòng thử lại.',
      );
    }

    const { data: finalizerData, error: finalizerError } =
      await adminClient.rpc('complete_initial_password_change', {
        p_user_id: user.id,
      });
    if (
      finalizerError ||
      typeof finalizerData !== 'object' ||
      finalizerData === null
    ) {
      return failure(
        500,
        'PASSWORD_CHANGE_INCOMPLETE',
        'Mật khẩu đã được cập nhật nhưng chưa thể hoàn tất hồ sơ. Vui lòng thử lại.',
      );
    }

    return new Response(JSON.stringify(finalizerData), {
      status: 200,
      headers: jsonHeaders,
    });
  } catch {
    return failure(
      500,
      'INTERNAL_ERROR',
      'Không thể đổi mật khẩu. Vui lòng thử lại.',
    );
  }
});
