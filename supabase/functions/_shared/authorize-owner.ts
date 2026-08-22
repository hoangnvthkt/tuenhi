import { createClient } from 'npm:@supabase/supabase-js@2.112.3';
import { failure, isCommandEnvelope } from './http.ts';

function requiredEnvironment(name: string) {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing runtime environment: ${name}`);
  return value;
}

export async function authorizeOwner(request: Request) {
  const authorization = request.headers.get('Authorization');
  if (!authorization?.startsWith('Bearer ')) {
    return {
      ok: false as const,
      response: failure(
        401,
        'AUTH_REQUIRED',
        'Vui lòng đăng nhập để tiếp tục.',
      ),
    };
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
      return {
        ok: false as const,
        response: failure(
          401,
          'AUTH_REQUIRED',
          'Phiên đăng nhập không còn hợp lệ.',
        ),
      };
    }

    const { data: authorizationData, error: authorizationError } =
      await userClient.rpc('authorize_staff_admin');
    if (
      authorizationError ||
      !isCommandEnvelope(authorizationData) ||
      authorizationData.ok !== true ||
      typeof authorizationData.data !== 'object' ||
      authorizationData.data === null ||
      (authorizationData.data as Record<string, unknown>).actorId !== user.id
    ) {
      return {
        ok: false as const,
        response: failure(
          403,
          'PERMISSION_DENIED',
          'Bạn không có quyền thực hiện thao tác này.',
        ),
      };
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      db: { schema: 'api' },
      auth: { persistSession: false, autoRefreshToken: false },
    });

    return {
      ok: true as const,
      actorId: user.id,
      userClient,
      adminClient,
    };
  } catch {
    return {
      ok: false as const,
      response: failure(
        500,
        'INTERNAL_ERROR',
        'Không thể kiểm tra quyền tài khoản. Vui lòng thử lại.',
      ),
    };
  }
}
