import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { expect, test, type Page } from '@playwright/test';

test.describe.configure({ mode: 'serial' });

function required(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Thiếu biến môi trường E2E: ${name}`);
  return value;
}

const url = required('SUPABASE_URL');
required('SUPABASE_PUBLISHABLE_KEY');
const secretKey = required('SUPABASE_SECRET_KEY');
const ownerPassword = required('TEST_OWNER_PASSWORD');
const employeePassword = required('TEST_EMPLOYEE_PASSWORD');
const ownerEmailBase = required('TEST_OWNER_EMAIL');
const employeeEmailBase = required('TEST_EMPLOYEE_EMAIL');
const runId = crypto.randomUUID();

for (const email of [ownerEmailBase, employeeEmailBase]) {
  if (!/^codex-phase1a-[a-z0-9-]+@example\.invalid$/i.test(email)) {
    throw new Error(
      'Email E2E phải dùng miền example.invalid và tiền tố codex-phase1a-.',
    );
  }
}

let admin: SupabaseClient;
let ownerEmail = '';
let employeeEmail = '';
let requiredEmail = '';
let ownerDisplayName = '';
let ownerId = '';
let employeeId = '';
let requiredId = '';
const profileIds: string[] = [];
const authIds: string[] = [];

function scopedEmail(base: string, label: string, projectName: string) {
  const [, domain = 'example.invalid'] = base.toLowerCase().split('@');
  const safeProject = projectName.replace(/[^a-z0-9]+/gi, '-').toLowerCase();
  return `codex-phase1a-e2e-${label}-${safeProject}-${runId}@${domain}`;
}

async function createAuthUser(email: string, password: string) {
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error || !data.user) throw new Error('Không thể tạo Auth user E2E.');
  authIds.push(data.user.id);
  return data.user.id;
}

async function login(page: Page, email: string, password: string) {
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Mật khẩu').fill(password);
  await page.getByRole('button', { name: 'Đăng nhập' }).click();
}

test.beforeAll(async ({ browserName }, workerInfo) => {
  admin = createClient(url, secretKey, {
    db: { schema: 'api' },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  ownerEmail = scopedEmail(ownerEmailBase, 'owner', workerInfo.project.name);
  employeeEmail = scopedEmail(
    employeeEmailBase,
    'employee',
    workerInfo.project.name,
  );
  requiredEmail = scopedEmail(
    employeeEmailBase,
    'required',
    workerInfo.project.name,
  );
  ownerDisplayName = `Owner E2E ${browserName} ${workerInfo.project.name}`;

  ownerId = await createAuthUser(ownerEmail, ownerPassword);
  employeeId = await createAuthUser(employeeEmail, employeePassword);
  requiredId = await createAuthUser(requiredEmail, employeePassword);

  const profiles = [
    {
      id: ownerId,
      email: ownerEmail,
      display_name: ownerDisplayName,
      role_template: 'OWNER',
      is_active: true,
      must_change_password: false,
      created_by: null,
    },
    {
      id: employeeId,
      email: employeeEmail,
      display_name: `Nhân viên E2E ${workerInfo.project.name}`,
      role_template: 'SALES_WAREHOUSE',
      is_active: true,
      must_change_password: false,
      created_by: ownerId,
    },
    {
      id: requiredId,
      email: requiredEmail,
      display_name: `Đổi mật khẩu E2E ${workerInfo.project.name}`,
      role_template: 'BUSINESS',
      is_active: true,
      must_change_password: true,
      created_by: ownerId,
    },
  ];
  const { error } = await admin.from('profiles').insert(profiles);
  if (error) throw new Error('Không thể tạo profile E2E.');
  profileIds.push(ownerId, employeeId, requiredId);
});

test.afterAll(async () => {
  let cleanupFailed = false;
  if (profileIds.length > 0) {
    const { data, error } = await admin.rpc('cleanup_phase1a_test_users', {
      p_user_ids: profileIds,
    });
    cleanupFailed =
      Boolean(error) ||
      typeof data !== 'object' ||
      data === null ||
      data.ok !== true;
  }
  for (const id of authIds.reverse()) {
    const { error } = await admin.auth.admin.deleteUser(id);
    cleanupFailed ||= Boolean(error);
  }
  if (cleanupFailed) {
    throw new Error('Không thể dọn sạch dữ liệu E2E tạm trên Cloud.');
  }
});

test('hiển thị lỗi đăng nhập bằng tiếng Việt', async ({ page }) => {
  await login(page, ownerEmail, 'MatKhauSai123');
  await expect(page.getByText('Email hoặc mật khẩu không đúng.')).toBeVisible();
});

test('bắt buộc đổi mật khẩu lần đầu', async ({ page }) => {
  await login(page, requiredEmail, employeePassword);
  await expect(
    page.getByRole('heading', { name: 'Tạo mật khẩu mới' }),
  ).toBeVisible();
  const newPassword = `Cc3${runId}z`;
  await page.getByLabel('Mật khẩu mới', { exact: true }).fill(newPassword);
  await page.getByLabel('Nhập lại mật khẩu mới').fill(newPassword);
  await page.getByRole('button', { name: 'Đổi mật khẩu' }).click();
  await expect(page.getByRole('heading', { name: 'Tổng quan' })).toBeVisible();
});

test('owner vào màn nhân viên và đăng xuất', async ({ page }) => {
  await login(page, ownerEmail, ownerPassword);
  await expect(page.getByRole('heading', { name: 'Tổng quan' })).toBeVisible();
  await page.getByRole('link', { name: 'Nhân viên' }).first().click();
  await expect(
    page.getByRole('heading', { name: 'Nhân viên & phân quyền' }),
  ).toBeVisible();
  await page.getByText(ownerDisplayName).first().click();
  await page.getByRole('button', { name: 'Đăng xuất' }).click();
  await expect(
    page.getByRole('heading', { name: 'Đăng nhập bán hàng' }),
  ).toBeVisible();
});

test('nhân viên bị chặn route staff', async ({ page }) => {
  await login(page, employeeEmail, employeePassword);
  await expect(page.getByRole('heading', { name: 'Tổng quan' })).toBeVisible();
  await page.goto('/staff');
  await expect(
    page.getByText('Bạn không có quyền truy cập chức năng này.'),
  ).toBeVisible();
});

test('hiển thị đúng navigation mobile/desktop và banner offline', async ({
  page,
  context,
}, testInfo) => {
  await login(page, ownerEmail, ownerPassword);
  await expect(page.getByRole('heading', { name: 'Tổng quan' })).toBeVisible();
  const mobileNavigation = page.getByRole('navigation', {
    name: 'Điều hướng di động',
  });
  const desktopNavigation = page.getByRole('navigation', {
    name: 'Điều hướng máy tính',
  });
  if (testInfo.project.name === 'mobile-chromium') {
    await expect(mobileNavigation).toBeVisible();
    await expect(desktopNavigation).toBeHidden();
  } else {
    await expect(desktopNavigation).toBeVisible();
    await expect(mobileNavigation).toBeHidden();
  }

  await context.setOffline(true);
  await expect(
    page.getByText('Bạn đang ngoại tuyến. Các thao tác ghi sổ sẽ bị khóa.'),
  ).toBeVisible();
  await context.setOffline(false);
});
