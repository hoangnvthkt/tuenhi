import { describe, expect, it, vi } from 'vitest';
import { createEmployeeHandler } from '../../supabase/functions/create-employee/handler';
const actorId = '00000000-0000-4000-8000-000000000001';
const idempotencyKey = '00000000-0000-4000-8000-000000000002';
const userId = '00000000-0000-4000-8000-000000000003';
const correlationId = '00000000-0000-4000-8000-000000000004';
const input = {
  email: 'a@example.com',
  displayName: 'An',
  roleTemplate: 'BUSINESS',
  temporaryPassword: 'Password123',
  idempotencyKey,
};
const metadata = {
  actorId,
  idempotencyKey,
  email: input.email,
  displayName: input.displayName,
  roleTemplate: input.roleTemplate,
};
const ok = (data: unknown) => ({ ok: true, data, error: null, correlationId });
function setup() {
  const createUser = vi
    .fn()
    .mockResolvedValue({ data: { user: { id: userId } }, error: null });
  const getUserById = vi.fn().mockResolvedValue({
    data: {
      user: {
        id: userId,
        email: input.email,
        app_metadata: { staffCreation: metadata },
      },
    },
    error: null,
  });
  const finalize = vi
    .fn()
    .mockResolvedValue({ data: ok({ userId, created: false }), error: null });
  const rpc = vi.fn((name: string) =>
    name === 'get_project_lifecycle'
      ? Promise.resolve({
          data: ok({ staffAccessPolicy: 'OWNER_WAIVER' }),
          error: null,
        })
      : finalize(),
  );
  const authorize = vi.fn().mockResolvedValue({
    ok: true,
    actorId,
    adminClient: { rpc, auth: { admin: { createUser, getUserById } } },
  });
  const handler = createEmployeeHandler(authorize);
  const send = (body: unknown) =>
    handler(
      new Request('http://localhost', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    );
  return { send, createUser, getUserById, finalize, rpc, authorize };
}
describe('create employee recovery boundary', () => {
  it('binds creation fields to Auth metadata and resumes finalization without creating Auth again', async () => {
    const t = setup();
    t.finalize.mockResolvedValueOnce({
      data: null,
      error: new Error('db unavailable'),
    });
    const first = await t.send(input);
    expect(first.status).toBe(500);
    expect(await first.json()).toMatchObject({
      error: {
        code: 'STAFF_FINALIZATION_PENDING',
        details: { pendingUserId: userId, outcomeUnknown: true },
      },
    });
    expect(t.createUser).toHaveBeenCalledWith(
      expect.objectContaining({ app_metadata: { staffCreation: metadata } }),
    );
    expect(
      (await t.send({ pendingUserId: userId, idempotencyKey })).status,
    ).toBe(200);
    expect(t.createUser).toHaveBeenCalledTimes(1);
    expect(t.rpc).toHaveBeenLastCalledWith(
      'finalize_staff_profile',
      expect.objectContaining({
        p_role_template: 'BUSINESS',
        p_email: input.email,
        p_idempotency_key: idempotencyKey,
        p_created_by: actorId,
      }),
    );
  });
  it.each([
    { ...metadata, actorId: userId },
    { ...metadata, idempotencyKey: userId },
    { ...metadata, email: 'different@example.com' },
    { ...metadata, roleTemplate: 'OWNER' },
    null,
  ])(
    'rejects a stale, unrelated or tampered pending identity',
    async (staffCreation) => {
      const t = setup();
      t.getUserById.mockResolvedValue({
        data: {
          user: {
            id: userId,
            email: input.email,
            app_metadata: { staffCreation },
          },
        },
        error: null,
      });
      expect(
        (await t.send({ pendingUserId: userId, idempotencyKey })).status,
      ).toBe(409);
      expect(t.finalize).not.toHaveBeenCalled();
      expect(t.createUser).not.toHaveBeenCalled();
    },
  );
  it('preserves pending ID on repeat finalization business failure and never leaks server messages', async () => {
    const t = setup();
    t.finalize.mockResolvedValue({
      data: {
        ok: false,
        data: null,
        error: { code: 'INVALID_STATE', message: 'raw details', details: {} },
        correlationId,
      },
      error: null,
    });
    const response = await t.send({ pendingUserId: userId, idempotencyKey });
    expect(await response.json()).toMatchObject({
      error: {
        code: 'STAFF_FINALIZATION_PENDING',
        details: { pendingUserId: userId, outcomeUnknown: true },
      },
    });
  });
  it('distinguishes an existing email from an unknown Auth transport outcome', async () => {
    const t = setup();
    t.createUser.mockResolvedValueOnce({
      data: { user: null },
      error: { status: 422, code: 'email_exists' },
    });
    expect((await (await t.send(input)).json()).error.code).toBe(
      'DUPLICATE_STAFF_EMAIL',
    );
    t.createUser.mockResolvedValueOnce({
      data: { user: null },
      error: { status: 503 },
    });
    expect((await (await t.send(input)).json()).error).toMatchObject({
      code: 'STAFF_CREATE_OUTCOME_UNKNOWN',
      details: { pendingUserId: null, outcomeUnknown: true },
    });
  });
  it('honors authorization and lifecycle before any Auth mutation', async () => {
    const t = setup();
    t.authorize.mockResolvedValueOnce({
      ok: false,
      response: new Response('', { status: 403 }),
    });
    expect((await t.send(input)).status).toBe(403);
    t.rpc.mockResolvedValueOnce({
      data: ok({ staffAccessPolicy: 'BLOCKED' }),
      error: null,
    });
    expect((await t.send(input)).status).toBe(409);
    expect(t.createUser).not.toHaveBeenCalled();
  });
});
