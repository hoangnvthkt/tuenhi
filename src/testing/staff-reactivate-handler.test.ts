import { expect, it, vi } from 'vitest';
import { reactivateEmployeeHandler } from '../../supabase/functions/reactivate-employee/handler';
const userId = '00000000-0000-4000-8000-000000000001';
const idempotencyKey = '00000000-0000-4000-8000-000000000002';
const envelope = (data: unknown) => ({
  ok: true,
  data,
  error: null,
  correlationId: idempotencyKey,
});
function setup() {
  const rpc = vi.fn().mockResolvedValue({
    data: envelope({ userId, isActive: true, operationFound: true }),
    error: null,
  });
  const updateUserById = vi.fn().mockResolvedValue({ error: null });
  const authorize = vi.fn().mockResolvedValue({
    ok: true,
    userClient: { rpc },
    adminClient: { auth: { admin: { updateUserById } } },
  });
  const handle = reactivateEmployeeHandler(authorize);
  const send = (
    body: unknown = { userId, idempotencyKey, reason: 'Trở lại' },
  ) =>
    handle(
      new Request('http://localhost', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    );
  return { rpc, updateUserById, authorize, send };
}
it('reports Auth failure as pending and resumes without executing the profile command again', async () => {
  const t = setup();
  t.updateUserById.mockRejectedValueOnce(new Error('network'));
  expect(await (await t.send()).json()).toMatchObject({
    ok: true,
    data: { authReactivationPending: true },
  });
  expect(
    await (await t.send({ userId, idempotencyKey, resume: true })).json(),
  ).toMatchObject({ ok: true, data: { authReactivationPending: false } });
  expect(
    t.rpc.mock.calls.filter(([name]) => name === 'set_staff_active'),
  ).toHaveLength(1);
  expect(t.updateUserById).toHaveBeenNthCalledWith(2, userId, {
    ban_duration: 'none',
  });
});
it.each([
  'PERMISSION_DENIED',
  'LAST_ACTIVE_OWNER',
  'STAFF_RECOVERY_STALE',
  'STAFF_OPERATION_UNKNOWN',
])('preserves %s and never calls Auth after denial', async (code) => {
  const t = setup();
  t.rpc.mockResolvedValue({
    data: {
      ok: false,
      data: null,
      error: { code, message: 'safe', details: {} },
      correlationId: idempotencyKey,
    },
    error: null,
  });
  expect((await t.send()).status).toBe(400);
  expect(t.updateUserById).not.toHaveBeenCalled();
});
it('does not unban a different user when an idempotency key returns an old target', async () => {
  const t = setup();
  t.rpc.mockResolvedValue({
    data: envelope({ userId: idempotencyKey, isActive: true }),
    error: null,
  });
  expect((await t.send()).status).toBe(409);
  expect(t.updateUserById).not.toHaveBeenCalled();
});
it('fails closed on stale inactive current state and unknown RPC transport', async () => {
  const t = setup();
  t.rpc
    .mockResolvedValueOnce({
      data: envelope({ userId, isActive: true }),
      error: null,
    })
    .mockResolvedValueOnce({
      data: envelope({ userId, isActive: false, operationFound: true }),
      error: null,
    });
  expect((await t.send()).status).toBe(409);
  expect(t.updateUserById).not.toHaveBeenCalled();
  t.rpc.mockRejectedValueOnce(new Error('lost response'));
  expect(await (await t.send()).json()).toMatchObject({
    ok: false,
    error: { details: { outcomeUnknown: true } },
  });
});
it('requires Owner authorization before inspecting or mutating anything', async () => {
  const t = setup();
  t.authorize.mockResolvedValue({
    ok: false,
    response: new Response('', { status: 403 }),
  });
  expect((await t.send()).status).toBe(403);
  expect(t.rpc).not.toHaveBeenCalled();
  expect(t.updateUserById).not.toHaveBeenCalled();
});
