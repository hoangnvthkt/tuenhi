import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import ExcelJS from 'exceljs';
import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';

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
const marker = runId.replaceAll('-', '').slice(0, 12).toUpperCase();
let admin: SupabaseClient;
let ownerEmail = '';
let ownerId = '';

function scopedEmail(projectName: string) {
  const safeProject = projectName.replace(/[^a-z0-9]+/gi, '-').toLowerCase();
  return `codex-phase1b-catalog-${safeProject}-${runId}@example.invalid`;
}

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
  ownerEmail = scopedEmail(workerInfo.project.name);
  const created = await admin.auth.admin.createUser({
    email: ownerEmail,
    password: ownerPassword,
    email_confirm: true,
  });
  if (created.error || !created.data.user) {
    throw new Error('Không thể tạo owner E2E Phase 1B.');
  }
  ownerId = created.data.user.id;
  const profile = await admin.from('profiles').insert({
    id: ownerId,
    email: ownerEmail,
    display_name: `Owner catalog ${browserName} ${marker}`,
    role_template: 'OWNER',
    is_active: true,
    must_change_password: false,
    created_by: null,
  });
  if (profile.error) throw new Error('Không thể tạo profile E2E Phase 1B.');
});

test.afterAll(async () => {
  let failed = false;
  if (ownerId) {
    const images = await admin
      .from('product_images')
      .select('object_path')
      .eq('uploaded_by', ownerId);
    if (images.error) {
      failed = true;
    } else if (images.data.length > 0) {
      const removed = await admin.storage
        .from('product-images')
        .remove(images.data.map((item) => item.object_path));
      failed ||= Boolean(removed.error);
    }
    const cleanup = await admin.rpc('cleanup_phase1b_test_users', {
      p_user_ids: [ownerId],
    });
    failed ||=
      Boolean(cleanup.error) ||
      typeof cleanup.data !== 'object' ||
      cleanup.data === null ||
      cleanup.data.ok !== true ||
      cleanup.data.data.remainingProfiles !== 0;
    const auth = await admin.auth.admin.deleteUser(ownerId);
    failed ||= Boolean(auth.error);
  }
  if (failed) throw new Error('Không thể dọn sạch dữ liệu E2E catalog.');
});

test('phục vụ đủ năm mẫu Excel chính thức', async ({ request }) => {
  for (const name of [
    'categories-v1.xlsx',
    'products-v1.xlsx',
    'suppliers-v1.xlsx',
    'customers-v1.xlsx',
    'customers-v2.xlsx',
  ]) {
    const response = await request.get(`/templates/import/${name}`);
    expect(response.ok(), name).toBe(true);
    expect((await response.body()).byteLength, name).toBeGreaterThan(1_000);
  }
});

test('owner tạo sản phẩm, giá bán và ảnh private trên desktop/mobile', async ({
  page,
}) => {
  await login(page);
  await page.goto('/products/new');
  await expect(
    page.getByRole('heading', { name: 'Thêm sản phẩm' }),
  ).toBeVisible();
  await page.getByLabel('SKU').fill(`SP-${marker}`);
  await page.getByLabel('Tên sản phẩm').fill(`Sản phẩm E2E ${marker}`);
  await page.getByLabel('Đơn vị tính').fill('Hộp');
  await page.getByLabel('Ngưỡng tồn tối thiểu').fill('5');
  await page.getByLabel('Giá bán hiện hành').fill('25000');
  await page.getByRole('button', { name: 'Lưu sản phẩm' }).click();
  await expect(
    page.getByRole('heading', { name: `Sản phẩm E2E ${marker}` }),
  ).toBeVisible();
  await expect(page.getByText('25.000 ₫').first()).toBeVisible();
  const pixel = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
    'base64',
  );
  await page.getByLabel('Chọn ảnh sản phẩm').setInputFiles({
    name: 'san-pham-e2e.png',
    mimeType: 'image/png',
    buffer: pixel,
  });
  await page.getByRole('button', { name: 'Tải ảnh lên' }).click();
  await expect(page.getByRole('img', { name: /Ảnh sản phẩm/ })).toBeVisible();
});

test('form khách hàng chuẩn hóa điện thoại và cấu hình kênh', async ({
  page,
}) => {
  await login(page);
  await page.goto('/more/customers');
  await page.getByRole('button', { name: 'Thêm khách hàng' }).click();
  await page.getByLabel('Mã khách hàng').fill(`KH-${marker}`);
  await page.getByLabel('Tên khách hàng').fill(`Khách E2E ${marker}`);
  await page.getByLabel('Số điện thoại').fill('0912345678');
  await page.getByRole('button', { name: 'Lưu khách hàng' }).click();
  await expect(page.getByText(`Khách E2E ${marker}`)).toBeVisible();
  await expect(page.getByText('+84 912 345 678').first()).toBeVisible();

  await page.goto('/more/sales-channels');
  await page.getByRole('button', { name: 'Thêm kênh bán' }).click();
  await page.getByLabel('Mã kênh bán').fill(`E2E_${marker}`);
  await page.getByLabel('Tên kênh bán').fill(`Kênh E2E ${marker}`);
  await page.getByLabel('Thứ tự hiển thị').fill('90');
  await page.getByRole('button', { name: 'Lưu kênh bán' }).click();
  await expect(page.getByText(`Kênh E2E ${marker}`)).toBeVisible();
});

test('generic import dùng mẫu chuẩn, khóa commit offline và không tự gửi lại', async ({
  page,
  context,
}) => {
  const template = await readFile('public/templates/import/categories-v1.xlsx');
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(template);
  const dataSheet = workbook.getWorksheet('Dữ liệu');
  if (!dataSheet) throw new Error('Mẫu Excel thiếu sheet Dữ liệu.');
  dataSheet.getRow(2).values = [`Nhóm E2E ${marker}`, 'Có'];
  const bytes = Buffer.from(await workbook.xlsx.writeBuffer());

  await login(page);
  await page.goto('/imports');
  await page.getByLabel('Loại dữ liệu').selectOption('CATEGORIES');
  await page.getByLabel(/Chọn tệp Excel/).setInputFiles({
    name: 'categories-v1.xlsx',
    mimeType:
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    buffer: bytes,
  });
  await page.getByRole('button', { name: 'Kiểm tra dữ liệu' }).click();
  await page.getByRole('button', { name: 'Xác nhận nhập' }).click();
  const commit = page.getByRole('button', { name: 'Nhập toàn bộ dữ liệu' });
  await context.setOffline(true);
  await page.evaluate(() => window.dispatchEvent(new Event('offline')));
  await expect(commit).toBeDisabled();
  await context.setOffline(false);
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  const success = page.getByRole('heading', {
    name: 'Nhập dữ liệu thành công',
  });
  await expect(success).not.toBeVisible();
  await commit.click();
  await expect(success).toBeVisible();
});
