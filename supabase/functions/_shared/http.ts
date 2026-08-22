export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const jsonHeaders = {
  ...corsHeaders,
  'Content-Type': 'application/json; charset=utf-8',
};

export function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: jsonHeaders });
}

export function failure(
  status: number,
  code: string,
  message: string,
  correlationId = crypto.randomUUID(),
) {
  return jsonResponse(
    {
      ok: false,
      data: null,
      error: { code, message, details: {} },
      correlationId,
    },
    status,
  );
}

export function success(
  data: Record<string, unknown>,
  correlationId = crypto.randomUUID(),
) {
  return jsonResponse({ ok: true, data, error: null, correlationId });
}

export async function readJson(request: Request) {
  try {
    return { ok: true as const, value: (await request.json()) as unknown };
  } catch {
    return {
      ok: false as const,
      response: failure(
        400,
        'VALIDATION_ERROR',
        'Dữ liệu gửi lên chưa hợp lệ.',
      ),
    };
  }
}

export function preflightOrMethodError(request: Request) {
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
  return null;
}

export function isCommandEnvelope(
  value: unknown,
): value is Record<string, unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as Record<string, unknown>).ok === 'boolean' &&
    typeof (value as Record<string, unknown>).correlationId === 'string'
  );
}
