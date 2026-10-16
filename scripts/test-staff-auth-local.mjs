import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { assertStaffLocalTarget } from './staff-auth-local-target.mjs';
// Read only the explicit local status file. Never load the application's .env.
const config = JSON.parse(
  readFileSync(process.env.TUENHI_LOCAL_STATUS_FILE, 'utf8'),
);
const url = assertStaffLocalTarget(config.API_URL);
const db = process.env.TUENHI_LOCAL_DB_CONTAINER;
assert.match(db ?? '', /^supabase_db_[a-zA-Z0-9_-]+$/);
const info = JSON.parse(
  execFileSync('docker', ['inspect', db], { encoding: 'utf8' }),
)[0];
assert.match(info.Config.Image, /supabase\/postgres/);
assert.ok(
  info.NetworkSettings.Ports['5432/tcp']?.length,
  'Local DB port mapping required',
);
function sql(query) {
  return execFileSync(
    'docker',
    [
      'exec',
      '-i',
      db,
      'psql',
      '-U',
      'postgres',
      '-d',
      'postgres',
      '-X',
      '-qAt',
      '-v',
      'ON_ERROR_STOP=1',
    ],
    { input: query, encoding: 'utf8' },
  ).trim();
}
assert.equal(
  sql('select count(*) from auth.users'),
  '0',
  'Use a fresh disposable local database, never an existing business dataset',
);
assert.equal(sql('select count(*) from api.sales'), '0');
const options = {
  db: { schema: 'api' },
  auth: { persistSession: false, autoRefreshToken: false },
  global: {
    fetch: (input, init) => fetch(input, { ...init, redirect: 'error' }),
  },
};
const admin = createClient(url, config.SERVICE_ROLE_KEY, options);
const client = () => createClient(url, config.ANON_KEY, options);
const password = `LocalOnly-A1-${randomUUID()}`;
async function envelope(result, label) {
  assert.equal(result.error, null, label);
  assert.equal(result.data?.ok, true, `${label}: ${result.data?.error?.code}`);
  return result.data.data;
}
const owner = await admin.auth.admin.createUser({
  email: 'owner@staff-local.test',
  password,
  email_confirm: true,
});
assert.equal(owner.error, null);
assert.match(owner.data.user.id, /^[0-9a-f-]{36}$/);
sql(
  `insert into api.profiles(id,email,display_name,role_template,must_change_password) values ('${owner.data.user.id}','owner@staff-local.test','Local Owner','OWNER',false); update app_private.project_lifecycle set mode='OWNER_PILOT',cutover_at=now(),staff_access_policy='OWNER_WAIVER',staff_access_granted_at=now();`,
);
const ownerClient = client();
assert.equal(
  (
    await ownerClient.auth.signInWithPassword({
      email: 'owner@staff-local.test',
      password,
    })
  ).error,
  null,
);
const key = randomUUID();
const createInput = {
  email: 'warehouse@staff-local.test',
  displayName: 'Local Warehouse',
  roleTemplate: 'WAREHOUSE_VIEWER',
  temporaryPassword: password,
  idempotencyKey: key,
};
await envelope(
  await ownerClient.functions.invoke('create-employee', { body: createInput }),
  'create',
);
assert.equal(
  sql(
    "select count(*) from api.profiles where email='warehouse@staff-local.test'",
  ),
  '1',
);
const staffId = sql(
  "select id from api.profiles where email='warehouse@staff-local.test'",
);
assert.match(staffId, /^[0-9a-f-]{36}$/);
console.log('PASS local create Auth and profile');
const staff = client();
assert.equal(
  (await staff.auth.signInWithPassword({ email: createInput.email, password }))
    .error,
  null,
);
let session = await staff.rpc('get_my_session_context');
assert.equal(session.data?.data?.mustChangePassword, true);
const nextPassword = `Changed-A2-${randomUUID()}`;
await envelope(
  await staff.functions.invoke('change-initial-password', {
    body: { password: nextPassword },
  }),
  'change-password',
);
const active = client();
assert.equal(
  (
    await active.auth.signInWithPassword({
      email: createInput.email,
      password: nextPassword,
    })
  ).error,
  null,
);
session = await active.rpc('get_my_session_context');
assert.equal(session.data?.data?.mustChangePassword, false);
assert.equal(session.data?.data?.roleTemplate, 'WAREHOUSE_VIEWER');
console.log('PASS initial password change and real login');
const permissions = session.data.data.permissions;
assert.deepEqual([...permissions].sort(), ['catalog.read', 'inventory.read']);
await envelope(
  await active.rpc('get_product_catalog', {
    p_limit: 1,
    p_stock_state: 'ALL',
    p_include_inactive: false,
  }),
  'warehouse-read-catalog',
);
const unauthorized = await active.functions.invoke('create-employee', {
  body: createInput,
});
assert.ok(unauthorized.error || unauthorized.data?.ok === false);
console.log('PASS non-Owner staff administration denied');
await envelope(
  await ownerClient.functions.invoke('deactivate-employee', {
    body: {
      userId: staffId,
      reason: 'Local acceptance lock',
      idempotencyKey: randomUUID(),
    },
  }),
  'deactivate',
);
const lockedSession = await active.rpc('get_my_session_context');
assert.equal(
  lockedSession.data?.ok,
  false,
  'Old access token must not get active profile',
);
const lockedCatalog = await active.rpc('get_product_catalog', {
  p_limit: 1,
  p_stock_state: 'ALL',
  p_include_inactive: false,
});
assert.equal(
  lockedCatalog.data?.ok,
  false,
  'Old access token must not read inventory',
);
assert.ok(
  (
    await client().auth.signInWithPassword({
      email: createInput.email,
      password: nextPassword,
    })
  ).error,
  'Banned Auth login denied',
);
console.log('PASS lock denies existing profile access and fresh login');
await envelope(
  await ownerClient.functions.invoke('reactivate-employee', {
    body: {
      userId: staffId,
      reason: 'Local acceptance reopen',
      idempotencyKey: randomUUID(),
    },
  }),
  'reactivate',
);
const reopened = client();
assert.equal(
  (
    await reopened.auth.signInWithPassword({
      email: createInput.email,
      password: nextPassword,
    })
  ).error,
  null,
);
const ready = await reopened.rpc('get_my_session_context');
assert.equal(ready.data?.ok, true);
assert.equal(ready.data.data.roleTemplate, 'WAREHOUSE_VIEWER');
assert.equal(
  sql(
    "select count(*) from auth.users where email='warehouse@staff-local.test'",
  ),
  '1',
);
console.log(
  'PASS reactivation restores login without duplicate user or role change',
);
console.log('LOCAL_AUTH_ACCEPTANCE_PASSED (production unchanged)');
