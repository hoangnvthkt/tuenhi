import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import ExcelJS from 'exceljs';
import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';

test.describe.configure({ mode: 'serial' });
test.setTimeout(90_000);

function required(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Thiếu biến môi trường E2E Phase 1C: ${name}`);
  return value;
}
const url = required('SUPABASE_URL');
const publishableKey = required('SUPABASE_PUBLISHABLE_KEY');
const serviceKey = required('SUPABASE_SECRET_KEY');
const runId = crypto.randomUUID();
const marker = runId.replaceAll('-', '').slice(0, 12).toUpperCase();
const password = `Tn!${crypto.randomUUID()}aA9`;
let admin: SupabaseClient;
let ownerEmail = '';
let staffEmail = '';
let ownerId = '';
let staffId = '';
let purchaseProductId = '';
let purchaseSku = '';
let openingSku = '';

async function login(page: Page, email: string) {
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Mật khẩu').fill(password);
  await page.getByRole('button', { name: 'Đăng nhập' }).click();
  await expect(page.getByRole('heading', { name: 'Tổng quan' })).toBeVisible();
}
async function logout(page: Page) {
  await page.locator('header summary').click();
  await page.getByRole('button', { name: 'Đăng xuất' }).click();
  await expect(page.getByRole('heading', { name: 'Đăng nhập' })).toBeVisible();
}

test.beforeAll(async (_fixtures, workerInfo) => {
  const project = workerInfo.project.name.replace(/[^a-z0-9]+/gi, '-');
  ownerEmail = `codex-phase1c-owner-${project}-${runId}@example.invalid`;
  staffEmail = `codex-phase1c-staff-${project}-${runId}@example.invalid`;
  admin = createClient(url, serviceKey, {
    db: { schema: 'api' },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const ownerAuth = await admin.auth.admin.createUser({
    email: ownerEmail,
    password,
    email_confirm: true,
  });
  const staffAuth = await admin.auth.admin.createUser({
    email: staffEmail,
    password,
    email_confirm: true,
  });
  if (
    ownerAuth.error ||
    staffAuth.error ||
    !ownerAuth.data.user ||
    !staffAuth.data.user
  )
    throw new Error('Không thể tạo Auth E2E Phase 1C.');
  ownerId = ownerAuth.data.user.id;
  staffId = staffAuth.data.user.id;
  const profiles = await admin.from('profiles').insert([
    {
      id: ownerId,
      email: ownerEmail,
      display_name: `Owner ${marker}`,
      role_template: 'OWNER',
      is_active: true,
      must_change_password: false,
      created_by: null,
    },
    {
      id: staffId,
      email: staffEmail,
      display_name: `Kho ${marker}`,
      role_template: 'SALES_WAREHOUSE',
      is_active: true,
      must_change_password: false,
      created_by: ownerId,
    },
  ]);
  if (profiles.error) throw new Error('Không thể tạo profile E2E Phase 1C.');
  const owner = createClient(url, publishableKey, {
    db: { schema: 'api' },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const signIn = await owner.auth.signInWithPassword({
    email: ownerEmail,
    password,
  });
  if (signIn.error) throw new Error('Không thể đăng nhập owner setup E2E.');
  const createProduct = async (suffix: string) => {
    const sku = `E2E-${suffix}-${marker}`;
    const result = await owner.rpc('save_product', {
      p_product_id: null,
      p_expected_version: null,
      p_product: {
        sku,
        barcode: null,
        name: `Thuốc ${suffix} ${marker}`,
        categoryId: null,
        unitName: 'Hộp',
        description: null,
        minStockQty: '0',
        isActive: true,
      },
      p_idempotency_key: crypto.randomUUID(),
    });
    if (result.error || !result.data?.ok)
      throw new Error('Không thể tạo sản phẩm E2E.');
    return { id: result.data.data.productId as string, sku };
  };
  const purchase = await createProduct('PN');
  const opening = await createProduct('MS');
  purchaseProductId = purchase.id;
  purchaseSku = purchase.sku;
  openingSku = opening.sku;
});

test.afterAll(async () => {
  let failed = false;
  if (ownerId && staffId) {
    const cleanup = await admin.rpc('cleanup_phase1c_test_users', {
      p_user_ids: [ownerId, staffId],
    });
    failed ||=
      Boolean(cleanup.error) ||
      !cleanup.data?.ok ||
      cleanup.data.data.remainingProfiles !== 0;
    for (const id of [staffId, ownerId])
      failed ||= Boolean((await admin.auth.admin.deleteUser(id)).error);
  }
  if (failed) throw new Error('Không thể dọn sạch E2E Phase 1C.');
});

test('nhân viên lập phiếu, owner ghi sổ, mở sổ Excel và xem valuation', async ({
  page,
}, testInfo) => {
  const mobileAction = { force: testInfo.project.name === 'mobile-chromium' };
  await login(page, staffEmail);
  await page.goto('/more/purchases/new');
  await page.getByLabel('Sản phẩm dòng 1').selectOption(purchaseProductId);
  await page.getByLabel('Số lượng nhận').fill('2.500');
  await page.getByRole('button', { name: 'Lưu nháp' }).click(mobileAction);
  await expect(
    page.getByRole('button', { name: 'Gửi owner nhập giá' }),
  ).toBeVisible();
  await page
    .getByRole('button', { name: 'Gửi owner nhập giá' })
    .click(mobileAction);
  const receiptUrl = page.url();
  await logout(page);

  await login(page, ownerEmail);
  await page.goto(receiptUrl);
  await page.getByLabel(new RegExp(`Đơn giá Thuốc PN ${marker}`)).fill('40000');
  await page.getByRole('button', { name: 'Ghi sổ' }).click(mobileAction);
  await expect(page.getByText(/Đã ghi sổ/).first()).toBeVisible();

  const template = await readFile(
    'public/templates/import/opening-balances-v1.xlsx',
  );
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(template);
  const sheet = workbook.getWorksheet('Dữ liệu');
  if (!sheet) throw new Error('Mẫu opening thiếu sheet Dữ liệu.');
  sheet.getRow(2).values = [openingSku, '3', '12500'];
  const bytes = Buffer.from(await workbook.xlsx.writeBuffer());
  await page.goto('/imports?target=OPENING_BALANCES');
  await expect(page.getByLabel('Loại dữ liệu')).toHaveValue('OPENING_BALANCES');
  await page.getByLabel(/Chọn tệp Excel/).setInputFiles({
    name: 'opening-balances-v1.xlsx',
    mimeType:
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    buffer: bytes,
  });
  await page.getByRole('button', { name: 'Kiểm tra dữ liệu' }).click();
  await page.getByRole('button', { name: 'Xác nhận nhập' }).click();
  await page.getByRole('button', { name: 'Nhập toàn bộ dữ liệu' }).click();
  await page.getByRole('link', { name: 'Kiểm tra phiếu mở sổ' }).click();
  await page
    .getByRole('button', { name: 'Hoàn tất kiểm đếm' })
    .click(mobileAction);
  await page.getByRole('button', { name: 'Ghi sổ' }).click(mobileAction);
  await expect(page.getByText(/Đã ghi sổ · Tổng giá trị/)).toBeVisible();
  await page.goto('/more/inventory/valuation');
  await expect(page.getByText(openingSku)).toBeVisible();
  await expect(page.getByText(purchaseSku)).toBeVisible();
  await expect(page.getByRole('cell', { name: '37.500 ₫' })).toBeVisible();
});
