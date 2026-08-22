import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { expect, test, type Page } from '@playwright/test';
import { legacyQ237Fixture } from '../src/features/imports/legacy/legacy-q237-fixture';

test.describe.configure({ mode: 'serial' });

function required(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Thiếu biến môi trường E2E Phase 1B: ${name}`);
  return value;
}

const url = required('SUPABASE_URL');
const secretKey = required('SUPABASE_SECRET_KEY');
const ownerPassword =
  process.env.TEST_PHASE1B_OWNER_PASSWORD?.trim() ||
  required('TEST_OWNER_PASSWORD');
const ownerEmailBase =
  process.env.TEST_PHASE1B_OWNER_EMAIL?.trim() || required('TEST_OWNER_EMAIL');
const runId = crypto.randomUUID();
let admin: SupabaseClient;
let ownerEmail = '';
let ownerId = '';

async function login(page: Page) {
  await page.goto('/login');
  await page.getByLabel('Email').fill(ownerEmail);
  await page.getByLabel('Mật khẩu').fill(ownerPassword);
  await page.getByRole('button', { name: 'Đăng nhập' }).click();
  await expect(page.getByRole('heading', { name: 'Tổng quan' })).toBeVisible();
}

test.beforeAll(async ({ browserName }, workerInfo) => {
  if (!/^codex-phase1b-[a-z0-9-]+@example\.invalid$/i.test(ownerEmailBase)) {
    throw new Error('Email E2E Phase 1B phải dùng miền example.invalid.');
  }
  admin = createClient(url, secretKey, {
    db: { schema: 'api' },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const project = workerInfo.project.name
    .replace(/[^a-z0-9]+/gi, '-')
    .toLowerCase();
  ownerEmail = `codex-phase1b-legacy-${project}-${runId}@example.invalid`;
  const created = await admin.auth.admin.createUser({
    email: ownerEmail,
    password: ownerPassword,
    email_confirm: true,
  });
  if (created.error || !created.data.user)
    throw new Error('Không thể tạo owner E2E legacy.');
  ownerId = created.data.user.id;
  const profile = await admin.from('profiles').insert({
    id: ownerId,
    email: ownerEmail,
    display_name: `Owner legacy ${browserName} ${runId.slice(0, 8)}`,
    role_template: 'OWNER',
    is_active: true,
    must_change_password: false,
    created_by: null,
  });
  if (profile.error) throw new Error('Không thể tạo profile E2E legacy.');
});

test.afterAll(async () => {
  let failed = false;
  if (ownerId) {
    const cleanup = await admin.rpc('cleanup_phase1b_test_users', {
      p_user_ids: [ownerId],
    });
    failed ||=
      Boolean(cleanup.error) ||
      typeof cleanup.data !== 'object' ||
      cleanup.data === null ||
      cleanup.data.ok !== true ||
      cleanup.data.data.remainingLegacySales !== 0;
    const auth = await admin.auth.admin.deleteUser(ownerId);
    failed ||= Boolean(auth.error);
  }
  if (failed) throw new Error('Không thể dọn sạch dữ liệu E2E legacy.');
});

test('adapter tổng hợp lưu kho tra cứu riêng và không có action vận hành', async ({
  page,
  context,
}) => {
  const fixture = legacyQ237Fixture();
  const buffer = Buffer.from(await fixture.arrayBuffer());
  await login(page);
  await page.goto('/imports');
  await page.getByRole('button', { name: 'Nhập dữ liệu bán hàng cũ' }).click();
  await expect(page.getByText('Chỉ để tra cứu', { exact: true })).toBeVisible();
  await page.getByLabel('Chọn workbook dữ liệu cũ').setInputFiles({
    name: 'du-lieu-cu-tong-hop.xlsx',
    mimeType:
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    buffer,
  });
  const mappings = page.getByRole('combobox', { name: /^Ghép/ });
  await expect(mappings.first()).toBeVisible();
  const mappingCount = await mappings.count();
  for (let index = 0; index < mappingCount; index += 1) {
    await mappings.nth(index).selectOption('SOURCE_LABEL_ONLY');
    await expect(mappings.nth(index)).toHaveValue('SOURCE_LABEL_ONLY');
  }
  const confirmations = page.getByRole('checkbox', { name: /^Xác nhận/ });
  await expect(confirmations).toHaveCount(mappingCount);
  for (let index = 0; index < mappingCount; index += 1) {
    await confirmations.nth(index).check();
    await expect(confirmations.nth(index)).toBeChecked();
  }
  await expect
    .poll(() =>
      confirmations.evaluateAll(
        (items) =>
          items.filter((item) => (item as HTMLInputElement).checked).length,
      ),
    )
    .toBe(mappingCount);
  const validate = page.getByRole('button', { name: 'Kiểm tra dữ liệu cũ' });
  await expect(validate).toBeEnabled();
  await validate.click();
  await expect(
    page.getByRole('heading', { name: 'Xác nhận kho tra cứu riêng' }),
  ).toBeVisible();
  const commit = page.getByRole('button', { name: 'Lưu vào dữ liệu cũ' });
  await context.setOffline(true);
  await page.evaluate(() => window.dispatchEvent(new Event('offline')));
  await expect(commit).toBeDisabled();
  await context.setOffline(false);
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await expect(page.getByText(/Đã lưu .* hóa đơn cũ/)).not.toBeVisible();
  await commit.click();
  await expect(page.getByText('Đã lưu 1 hóa đơn cũ.')).toBeVisible();
  await page.getByRole('link', { name: 'Mở dữ liệu cũ' }).click();
  await expect(page.getByRole('heading', { name: 'Dữ liệu cũ' })).toBeVisible();
  await expect(page.getByText('HD-GIA-001')).toBeVisible();
  await page.getByRole('link', { name: /HD-GIA-001/ }).click();
  await expect(page.getByText('Chỉ để tra cứu', { exact: true })).toBeVisible();
  for (const forbidden of [
    'Trả hàng',
    'Hủy hóa đơn',
    'Thanh toán',
    'Ghi tồn',
    'Lợi nhuận',
  ]) {
    await expect(page.getByRole('button', { name: forbidden })).toHaveCount(0);
    await expect(page.getByRole('link', { name: forbidden })).toHaveCount(0);
  }
});
