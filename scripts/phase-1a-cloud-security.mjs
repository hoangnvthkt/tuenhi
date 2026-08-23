import { createClient } from '@supabase/supabase-js';
import { assertSyntheticTestsAllowed } from './project-lifecycle.mjs';

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Thiếu biến môi trường bắt buộc: ${name}`);
  return value;
}

async function temporaryServiceKey() {
  const response = await fetch(
    `https://api.supabase.com/v1/projects/${required('SUPABASE_PROJECT_ID')}/api-keys`,
    {
      headers: { Authorization: `Bearer ${required('SUPABASE_ACCESS_TOKEN')}` },
    },
  );
  if (!response.ok)
    throw new Error(
      'Không thể lấy service key tạm thời cho Cloud test Phase 1A.',
    );
  const key = (await response.json()).find(
    (item) => item.name === 'service_role',
  )?.api_key;
  if (!key)
    throw new Error(
      'Project không trả service_role key cho Cloud test Phase 1A.',
    );
  return key;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function isEnvelope(value) {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof value.ok === 'boolean' &&
    typeof value.correlationId === 'string'
  );
}

const url = process.env.VITE_SUPABASE_URL ?? required('SUPABASE_URL');
const publishableKey =
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY ??
  required('SUPABASE_PUBLISHABLE_KEY');
const secretKey = await temporaryServiceKey();
const ownerEmail = required('TEST_OWNER_EMAIL').toLowerCase();
const ownerPassword = required('TEST_OWNER_PASSWORD');
const employeeEmail = required('TEST_EMPLOYEE_EMAIL').toLowerCase();
const employeePassword = required('TEST_EMPLOYEE_PASSWORD');

for (const email of [ownerEmail, employeeEmail]) {
  assert(
    /^codex-phase1a-[a-z0-9-]+@example\.invalid$/.test(email),
    'Email test phải dùng miền example.invalid và tiền tố codex-phase1a-.',
  );
}

const runId = crypto.randomUUID();
const displayPrefix = `codex-phase1a-${runId}`;
const derivedEmail = (label) =>
  `codex-phase1a-${label}-${runId}@example.invalid`;
const createdAuthIds = [];
const createdProfileIds = [];
let passed = 0;

const admin = createClient(url, secretKey, {
  db: { schema: 'api' },
  auth: { persistSession: false, autoRefreshToken: false },
});
await assertSyntheticTestsAllowed(admin);

function browserClient() {
  return createClient(url, publishableKey, {
    db: { schema: 'api' },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function passCase(name, test) {
  const correlationId = await test();
  passed += 1;
  console.log(
    correlationId ? `PASS ${name} (${correlationId})` : `PASS ${name}`,
  );
}

async function createAuthUser(email, password) {
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error || !data.user) throw new Error('Không thể tạo user test tạm.');
  createdAuthIds.push(data.user.id);
  return data.user;
}

async function signIn(email, password) {
  const client = browserClient();
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw new Error('Không thể đăng nhập user test tạm.');
  return client;
}

async function expectEnvelope(client, name, args, expectedOk) {
  const { data, error } = await client.rpc(name, args);
  assert(!error, `RPC ${name} không trả được envelope an toàn.`);
  assert(isEnvelope(data), `RPC ${name} trả cấu trúc không hợp lệ.`);
  assert(data.ok === expectedOk, `RPC ${name} trả trạng thái ngoài dự kiến.`);
  return data;
}

async function cleanup() {
  if (createdProfileIds.length > 0) {
    const { data, error } = await admin.rpc('cleanup_phase1a_test_users', {
      p_user_ids: createdProfileIds,
    });
    if (error || !isEnvelope(data) || data.ok !== true) {
      console.error(
        'Không thể dọn hồ sơ test; cần kiểm tra theo ID của lần chạy.',
      );
    }
  }

  for (const userId of createdAuthIds.reverse()) {
    const { error } = await admin.auth.admin.deleteUser(userId);
    if (error)
      console.error('Không thể dọn một Auth user test theo ID đã tạo.');
  }
}

try {
  const secondEmail = derivedEmail('employee-b');
  const requiredEmail = derivedEmail('password-required');
  const noProfileEmail = derivedEmail('no-profile');
  const ownerUser = await createAuthUser(ownerEmail, ownerPassword);
  const employeeUser = await createAuthUser(employeeEmail, employeePassword);
  const secondUser = await createAuthUser(secondEmail, employeePassword);
  const requiredUser = await createAuthUser(requiredEmail, employeePassword);
  const noProfileUser = await createAuthUser(noProfileEmail, employeePassword);

  const { data: preexistingOwners, error: ownerLookupError } = await admin
    .from('profiles')
    .select('id')
    .eq('role_template', 'OWNER')
    .eq('is_active', true);
  if (ownerLookupError) throw new Error('Không thể kiểm tra owner hiện có.');

  const profiles = [
    {
      id: ownerUser.id,
      email: ownerEmail,
      display_name: `${displayPrefix}-owner`,
      role_template: 'OWNER',
      is_active: true,
      must_change_password: false,
      created_by: null,
    },
    {
      id: employeeUser.id,
      email: employeeEmail,
      display_name: `${displayPrefix}-employee-a`,
      role_template: 'SALES_WAREHOUSE',
      is_active: true,
      must_change_password: false,
      created_by: ownerUser.id,
    },
    {
      id: secondUser.id,
      email: secondEmail,
      display_name: `${displayPrefix}-employee-b`,
      role_template: 'BUSINESS',
      is_active: true,
      must_change_password: false,
      created_by: ownerUser.id,
    },
    {
      id: requiredUser.id,
      email: requiredEmail,
      display_name: `${displayPrefix}-password-required`,
      role_template: 'SALES_WAREHOUSE',
      is_active: true,
      must_change_password: true,
      created_by: ownerUser.id,
    },
  ];
  const { error: profileError } = await admin.from('profiles').insert(profiles);
  if (profileError) throw new Error('Không thể tạo profile test tạm.');
  createdProfileIds.push(...profiles.map((profile) => profile.id));

  const { error: notificationError } = await admin
    .from('user_notifications')
    .insert([
      {
        user_id: ownerUser.id,
        severity: 'INFO',
        category: 'TEST',
        title: 'Thông báo kiểm thử owner',
        message: 'Bản ghi tạm sẽ được xóa sau kiểm thử.',
      },
      {
        user_id: employeeUser.id,
        severity: 'INFO',
        category: 'TEST',
        title: 'Thông báo kiểm thử nhân viên',
        message: 'Bản ghi tạm sẽ được xóa sau kiểm thử.',
      },
    ]);
  if (notificationError)
    throw new Error('Không thể tạo notification test tạm.');

  const owner = await signIn(ownerEmail, ownerPassword);
  const employee = await signIn(employeeEmail, employeePassword);
  const second = await signIn(secondEmail, employeePassword);
  const passwordRequired = await signIn(requiredEmail, employeePassword);
  const noProfile = await signIn(noProfileEmail, employeePassword);

  await passCase('anon bị chặn khỏi toàn bộ bề mặt bảo vệ', async () => {
    const anon = browserClient();
    const session = await anon.rpc('get_my_session_context');
    const staff = await anon.rpc('list_staff', { p_limit: 5 });
    const notifications = await anon.rpc('get_my_notifications', {
      p_limit: 5,
    });
    const profiles = await anon.from('profiles').select('id');
    const notificationRows = await anon.from('user_notifications').select('id');
    assert(Boolean(session.error), 'Anon đã gọi được session RPC.');
    assert(Boolean(staff.error), 'Anon đã gọi được staff RPC.');
    assert(Boolean(notifications.error), 'Anon đã gọi được notification RPC.');
    assert(Boolean(profiles.error), 'Anon đã đọc được profiles.');
    assert(Boolean(notificationRows.error), 'Anon đã đọc được bảng thông báo.');
  });

  await passCase('user chưa có profile bị từ chối', async () => {
    const envelope = await expectEnvelope(
      noProfile,
      'get_my_session_context',
      undefined,
      false,
    );
    assert(
      envelope.error?.code === 'AUTH_REQUIRED',
      'Sai mã lỗi user chưa có profile.',
    );
    const staff = await expectEnvelope(
      noProfile,
      'list_staff',
      { p_limit: 5 },
      false,
    );
    assert(
      staff.error?.code === 'PERMISSION_DENIED',
      'User chưa có profile không bị chặn staff.',
    );
    const { data: rows, error: rowsError } = await noProfile
      .from('user_notifications')
      .select('id');
    assert(
      !rowsError && rows.length === 0,
      'User chưa có profile thấy dữ liệu.',
    );
    return envelope.correlationId;
  });

  await passCase(
    'user cần đổi mật khẩu chỉ đọc được session context',
    async () => {
      const session = await expectEnvelope(
        passwordRequired,
        'get_my_session_context',
        undefined,
        true,
      );
      assert(
        session.data.mustChangePassword === true,
        'Thiếu hard gate đổi mật khẩu.',
      );
      assert(
        session.data.permissions.length === 0,
        'User đổi mật khẩu vẫn có quyền hiệu lực.',
      );
      const staff = await expectEnvelope(
        passwordRequired,
        'list_staff',
        { p_limit: 5 },
        false,
      );
      const notifications = await expectEnvelope(
        passwordRequired,
        'get_my_notifications',
        { p_limit: 5 },
        false,
      );
      assert(
        notifications.error?.code === 'AUTH_REQUIRED',
        'User cần đổi mật khẩu vẫn đọc được thông báo.',
      );
      return staff.correlationId;
    },
  );

  await passCase('nhân viên không quản trị được staff', async () => {
    const list = await expectEnvelope(
      employee,
      'list_staff',
      { p_limit: 5 },
      false,
    );
    assert(
      list.error?.code === 'PERMISSION_DENIED',
      'Nhân viên không bị chặn staff.manage.',
    );
    const { error } = await employee.functions.invoke('create-employee', {
      body: {
        email: derivedEmail('forbidden-create'),
        displayName: 'Không được tạo',
        roleTemplate: 'SALES_WAREHOUSE',
        temporaryPassword: employeePassword,
        idempotencyKey: crypto.randomUUID(),
      },
    });
    assert(
      Boolean(error),
      'Nhân viên đã gọi được Edge Function tạo tài khoản.',
    );
    const role = await expectEnvelope(
      employee,
      'set_staff_role',
      {
        p_user_id: secondUser.id,
        p_role: 'BUSINESS',
        p_reason: 'Kiểm thử từ chối đổi vai trò',
        p_idempotency_key: crypto.randomUUID(),
      },
      false,
    );
    assert(
      role.error?.code === 'PERMISSION_DENIED',
      'Nhân viên đã thay đổi được vai trò.',
    );
    return list.correlationId;
  });

  await passCase(
    'owner-only permission không cấp được cho nhân viên',
    async () => {
      const envelope = await expectEnvelope(
        employee,
        'set_staff_permission_override',
        {
          p_user_id: employeeUser.id,
          p_permission_code: 'staff.manage',
          p_effect: 'GRANT',
          p_reason: 'Kiểm thử từ chối',
          p_idempotency_key: crypto.randomUUID(),
        },
        false,
      );
      assert(
        envelope.error?.code === 'PERMISSION_DENIED',
        'Nhân viên vượt biên quyền.',
      );
      return envelope.correlationId;
    },
  );

  await passCase(
    'nhân viên chỉ đọc session và thông báo của chính mình',
    async () => {
      const session = await expectEnvelope(
        employee,
        'get_my_session_context',
        undefined,
        true,
      );
      assert(
        session.data.userId === employeeUser.id,
        'Session trả sai danh tính nhân viên.',
      );
      const { data, error } = await employee
        .from('user_notifications')
        .select('user_id');
      assert(
        !error && data.length === 1,
        'Feed thông báo không đúng phạm vi user.',
      );
      assert(
        data[0]?.user_id === employeeUser.id,
        'RLS làm lộ thông báo user khác.',
      );
    },
  );

  await passCase('direct write và profile read bị từ chối', async () => {
    const profileRead = await employee.from('profiles').select('id');
    assert(Boolean(profileRead.error), 'Nhân viên đọc trực tiếp profiles.');
    const directInsert = await employee.from('user_notifications').insert({
      user_id: employeeUser.id,
      severity: 'INFO',
      category: 'TEST',
      title: 'Không được ghi',
      message: 'Không được ghi',
    });
    assert(
      Boolean(directInsert.error),
      'Nhân viên ghi trực tiếp notification.',
    );
    const directUpdate = await employee
      .from('user_notifications')
      .update({ title: 'Không được sửa' })
      .eq('id', crypto.randomUUID());
    assert(
      Boolean(directUpdate.error),
      'Nhân viên sửa trực tiếp notification.',
    );
    const directDelete = await employee
      .from('user_notifications')
      .delete()
      .eq('id', crypto.randomUUID());
    assert(
      Boolean(directDelete.error),
      'Nhân viên xóa trực tiếp notification.',
    );
  });

  await passCase('app_private không được expose qua Data API', async () => {
    const {
      data: { session },
    } = await employee.auth.getSession();
    const response = await fetch(
      `${url}/rest/v1/permission_definitions?select=code`,
      {
        headers: {
          apikey: publishableKey,
          Authorization: `Bearer ${session.access_token}`,
          'Accept-Profile': 'app_private',
        },
      },
    );
    assert(!response.ok, 'app_private đã bị expose qua Data API.');
  });

  await passCase('owner đọc staff và cấp quyền vận hành riêng', async () => {
    const list = await expectEnvelope(
      owner,
      'list_staff',
      { p_limit: 10 },
      true,
    );
    const override = await expectEnvelope(
      owner,
      'set_staff_permission_override',
      {
        p_user_id: secondUser.id,
        p_permission_code: 'legacy.sale.read',
        p_effect: 'GRANT',
        p_reason: 'Kiểm thử quyền vận hành',
        p_idempotency_key: crypto.randomUUID(),
      },
      true,
    );
    return override.correlationId ?? list.correlationId;
  });

  await passCase('không thể khóa owner hoạt động cuối cùng', async () => {
    if (preexistingOwners.length > 0) return null;
    const envelope = await expectEnvelope(
      owner,
      'set_staff_active',
      {
        p_user_id: ownerUser.id,
        p_active: false,
        p_reason: 'Kiểm thử owner cuối cùng',
        p_idempotency_key: crypto.randomUUID(),
      },
      false,
    );
    assert(
      envelope.error?.code === 'LAST_ACTIVE_OWNER',
      'Owner cuối cùng chưa được bảo vệ.',
    );
    return envelope.correlationId;
  });

  await passCase(
    'khóa một nhân viên không ảnh hưởng nhân viên khác',
    async () => {
      const changed = await expectEnvelope(
        owner,
        'set_staff_active',
        {
          p_user_id: employeeUser.id,
          p_active: false,
          p_reason: 'Kiểm thử khóa riêng lẻ',
          p_idempotency_key: crypto.randomUUID(),
        },
        true,
      );
      const inactive = await expectEnvelope(
        employee,
        'get_my_session_context',
        undefined,
        false,
      );
      assert(
        inactive.error?.code === 'ACCOUNT_INACTIVE',
        'Tài khoản khóa vẫn truy cập được.',
      );
      const inactiveStaff = await expectEnvelope(
        employee,
        'list_staff',
        { p_limit: 5 },
        false,
      );
      assert(
        inactiveStaff.error?.code === 'PERMISSION_DENIED',
        'Tài khoản khóa vẫn thực thi được lệnh staff.',
      );
      await expectEnvelope(second, 'get_my_session_context', undefined, true);
      return changed.correlationId;
    },
  );

  console.log(`Cloud security: ${passed} trường hợp đã qua.`);
} catch (error) {
  const message =
    error instanceof Error ? error.message : 'Cloud security gate thất bại.';
  console.error(message);
  process.exitCode = 1;
} finally {
  await cleanup();
}
